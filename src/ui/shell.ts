import {render as renderSavedSearch} from "./saved-searches";
import {preloadFavs} from "../storage/db";
import {initProvider} from "../provider";
import cssContent from '../css/style.css?inline';
import { setupDebug } from '../debug';

export function cleanDocument() {
    document.open();
    document.close();
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
    cleanDocument();
    buildSearch();
    renderSavedSearch();
    buildGridPlaceholder();
    void preloadFavs();
    await initProvider();
    const debug = false;
    if (debug) setupDebug();
}
