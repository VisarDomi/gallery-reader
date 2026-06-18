import {render} from "./saved-searches";
import {saveSearch} from "../storage/localstorage";
import {preloadFavs} from "../storage/db";
import {initProvider, providerName} from "../provider";
import cssContent from '../css/style.css?inline';
import { setupDebug } from '../debug';
export function cleanDocument() {
    document.open();
    document.close();
    const style = document.createElement('style');
    style.textContent = cssContent;
    document.head.appendChild(style);
}

// ── search header (input + suggestions + button) ──────────────────
function buildSearchHeader(): void {
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
}

function buildSavedSearches(): void {
    const container = document.createElement('div');
    container.className = 'hs-saved-searches';
    const header = document.getElementById('hs-wrap') as HTMLDivElement;
    header.insertAdjacentElement('afterend', container);
    const input = document.getElementById('query-input') as HTMLTextAreaElement;
    input.onkeydown = function (e) {
        if (e.key === 'Enter') {
            const val = input.value.trim();
            const query = val ? val : "language:japanese";
            saveSearch(query, 1, render, providerName());
            // execute query here.
        }
    };

    render();
}

// ── grid placeholder ──────────────────────────────────────────────
function buildGridPlaceholder(): void {
    const grid = document.createElement('div');
    grid.id = 'hs-grid';
    document.body.appendChild(grid);
}

// ── public ────────────────────────────────────────────────────────
export async function initShell(): Promise<void> {
    cleanDocument();
    buildSearchHeader();
    buildSavedSearches()
    buildGridPlaceholder();
    void preloadFavs();
    await initProvider();
    const debug = false;
    if (debug) setupDebug();
}
