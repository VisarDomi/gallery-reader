import cssContent from '../css/style.css?inline';
import {setupDebug} from "../debug";

const SEARCH_DOMAIN = 'ltn.gold-usergeneratedcontent.net';

export function loadScript(filename: string): Promise<void> {
    return new Promise(resolve => {
        const script = document.createElement('script');
        script.src = `https://${SEARCH_DOMAIN}/${filename}`;
        script.onload = () => resolve();
        document.head.appendChild(script);
    });
}

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

    const suggestions = document.createElement('ul');
    suggestions.id = 'search-suggestions';
    searchWrap.appendChild(suggestions);

    const button = document.createElement('button');
    button.id = 'search-button';
    button.type = 'button';
    button.textContent = 'Search';

    header.appendChild(searchWrap);
    header.appendChild(button);
    document.body.appendChild(header);
}

// ── grid placeholder ──────────────────────────────────────────────
function buildGridPlaceholder(): void {
    const grid = document.createElement('div');
    grid.id = 'hs-grid';
    document.body.appendChild(grid);
}

// ── external scripts ──────────────────────────────────────────────
// Intercept jQuery .on() after jQuery loads so search.js never binds its
// broken click handler to .search-suggestion_string elements.
function detachJQueryFromSuggestionLinks(): void {
    const jq = (window as any).jQuery;
    if (!jq) return;
    const origOn = jq.fn.on;
    jq.fn.on = function (this: any, types: string, selector: any, handler: any) {
        if (typeof selector === 'function') { handler = selector; }
        if (types === 'click' && typeof handler === 'function' && this.is('.search-suggestion_string')) {
            return this;
        }
        return origOn.apply(this, arguments as any);
    } as any;
}

// ── external scripts ──────────────────────────────────────────────
async function loadSiteScripts(): Promise<void> {
    await loadScript('jquery.min.js');
    detachJQueryFromSuggestionLinks();
    await loadScript('common.js');
    await loadScript('searchlib.js');
    await loadScript('search.js');
}

// ── dropdown selection (replaces broken jQuery .bind() handler) ────
function setupDropdownHandler(): void {
    const sugg = document.getElementById('search-suggestions')!;
    sugg.addEventListener('click', (e) => {
        const a = (e.target as Element).closest<HTMLAnchorElement>('a.search-suggestion_string');
        if (!a) return;
        e.preventDefault(); // block href="#" navigation
        e.stopPropagation(); // prevent site's delegated jQuery handler on document

        const resultSpan = a.querySelector('.search-result');
        const nsSpan = a.querySelector('.search-ns');
        if (!resultSpan) return;

        const name = resultSpan.textContent?.trim() ?? '';
        const nsText = nsSpan?.textContent?.trim() ?? '';
        const ns = nsText.replace(/^\(|\)$/g, '').trim();

        const underscored = name.replace(/\s/g, '_');
        const term = ns ? `${ns}:${underscored}` : underscored;

        // Replace last whitespace-delimited word, preserving - prefix
        const input = document.getElementById('query-input') as HTMLInputElement;
        const val = input.value;
        const lastSpace = val.lastIndexOf(' ');
        const prefix = lastSpace >= 0 ? val.substring(0, lastSpace + 1) : '';
        const lastWord = val.substring(lastSpace + 1);
        const dash = lastWord.startsWith('-') ? '-' : '';
        input.value = prefix + dash + term + ' ';
        input.focus();

        const origClear = (window as any).clear_page as Function | undefined;
        if (origClear) origClear();
    }, { capture: true });
}

// ── ad blocker ────────────────────────────────────────────────────
function startAdBlocker(): void {
    new MutationObserver(mutations => {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (!(node instanceof Element)) continue;
                const tag = node.tagName;
                const cls = (node as Element).className;
                if (tag === 'SCRIPT' || tag === 'IFRAME' || tag === 'INS') {
                    node.remove();
                } else if (tag === 'DIV' && cls.length > 0 && !cls.startsWith('hs-')) {
                    node.remove();
                }
            }
        }
    }).observe(document.body, { childList: true });
}

// ── public ────────────────────────────────────────────────────────
export async function initShell(): Promise<void> {
    cleanDocument();
    buildSearchHeader();
    buildGridPlaceholder();
    await loadSiteScripts();
    setupDropdownHandler();
    startAdBlocker();
    const debug = false;
    if (debug) setupDebug();
}
