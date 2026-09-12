import {render as renderSavedSearch} from "./saved-searches";
import {initProvider, searchUrl} from "../provider";
import cssContent from '../css/style.css?inline';
import {beginScrollRestore, deferScrollRestore, loadScrollPosition, loadSearches, saveScrollPosition} from "../storage/preferences";
import { initializeStorage } from '../storage/initialize';
import { onSettledScroll } from '../core/scroll-settle';

export function startInit(documentTitle: string): void {
    window.stop();
    document.open();
    document.close();
    // document-start may precede creation of the parser's head/body nodes.
    if (!document.documentElement) document.appendChild(document.createElement('html'));
    if (!document.head) document.documentElement.appendChild(document.createElement('head'));
    if (!document.body) document.documentElement.appendChild(document.createElement('body'));
    // An early extension takeover runs before the site's viewport is parsed.
    // Own this explicitly instead of inheriting Safari's desktop-width default.
    const viewport = document.createElement('meta');
    viewport.name = 'viewport';
    viewport.content = 'width=device-width, initial-scale=1';
    document.head.appendChild(viewport);
    document.title = documentTitle;
    const style = document.createElement('style');
    style.textContent = cssContent;
    document.head.appendChild(style);
}

export function buildSearch(): void {
    const header = document.createElement('div');
    header.id = 'hs-wrap';

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
        const saved = (await loadSearches()).find(s => s.query === query);
        window.location.href = searchUrl(query, saved?.page);
    };
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey && !e.defaultPrevented && !e.isComposing) {
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

async function initAppState(query?: string): Promise<void> {
    syncInputFromUrl(query);
    // bfcache in action
    window.addEventListener('pageshow', event => {
        if (event.persisted) syncInputFromUrl(query);
    });
    // Never start an IDB transaction as Safari suspends this document. A
    // suspended writer can block every same-origin page, including fresh loads.
    const saveScroll = () => {
        if (!document.hidden) void saveScrollPosition(location.pathname + location.search, window.scrollY).catch(console.error);
    };
    onSettledScroll(saveScroll);
    const urlKey = location.pathname + location.search;
    const savedY = await loadScrollPosition(urlKey);
    if (savedY !== null) deferScrollRestore(savedY);
}

export async function initShell(query?: string): Promise<void> {
    beginScrollRestore();
    buildSearch();
    buildGridPlaceholder();
    syncInputFromUrl(query);
    void initProvider()?.catch(console.error);
    try { await initializeStorage(); }
    catch (error) {
        document.getElementById('hs-grid')!.textContent = 'Could not load local reader data. Keep website data intact and reload to retry. ' + (error instanceof Error ? error.message : String(error));
        throw error;
    }
    await renderSavedSearch();
    await initAppState(query);
}
