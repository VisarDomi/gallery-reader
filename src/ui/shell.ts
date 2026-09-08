import {render as renderSavedSearch} from "./saved-searches";
import {initProvider, searchUrl} from "../provider";
import cssContent from '../css/style.css?inline';
import {deferScrollRestore, loadScrollPosition, loadSearches, saveScrollPosition} from "../storage/preferences";
import { initializeStorage } from '../storage/initialize';

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
        const saved = (await loadSearches()).find(s => s.query === query);
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

async function initAppState(query?: string): Promise<void> {
    syncInputFromUrl(query);
    // bfcache in action
    window.addEventListener('pageshow', event => {
        if (event.persisted) syncInputFromUrl(query);
    });
    const saveScroll = () => { void saveScrollPosition(location.pathname + location.search, window.scrollY).catch(console.error); };
    window.addEventListener('scrollend', () => {
        setTimeout(saveScroll, 100);
    });
    window.addEventListener('pagehide', saveScroll);
    // Persist while visible too; pagehide alone cannot guarantee an async commit before suspension.
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveScroll(); });
    const urlKey = location.pathname + location.search;
    const savedY = await loadScrollPosition(urlKey);
    if (savedY !== null) deferScrollRestore(savedY);
}

export async function initShell(query?: string): Promise<void> {
    buildSearch();
    buildGridPlaceholder();
    try { await initializeStorage(); }
    catch (error) {
        document.getElementById('hs-grid')!.textContent = 'Could not load local reader data. Keep website data intact and reload to retry. ' + (error instanceof Error ? error.message : String(error));
        throw error;
    }
    await renderSavedSearch();
    void initProvider()?.catch(console.error);
    await initAppState(query);
}
