import {CSS as rowCSS} from '../gallery-row/gallery-row';
import {loadSearches, addSearch, removeSearch} from './saved-searches';

const SEARCH_CSS = 'body{font-size:16px}#search-button{display:none}#search:after{display:none}' +
    '#hs-wrap{width:100%!important}' +
    '#hs-wrap #search,#hs-wrap .search-input{width:100%!important;max-width:none!important;display:block!important}' +
    '#hs-wrap #query-input{width:100%!important;min-width:100%!important;font-size:16px;box-sizing:border-box}';

const SAVED_CSS = '.hs-saved-searches{display:flex;flex-wrap:wrap;gap:6px;padding:6px 4px}' +
    '.hs-saved-chip{background:#222;color:#888;padding:4px 8px;border-radius:4px;font-size:16px;cursor:pointer;display:flex;align-items:center;gap:6px;border:none}' +
    '.hs-saved-chip:hover{color:#fff}' +
    '.hs-saved-chip .hs-saved-x{color:#555;font-size:16px;line-height:1}' +
    '.hs-saved-chip .hs-saved-x:hover{color:#f44}';

function injectSearchCSS(): void {
    const s = document.createElement('style');
    s.textContent = SEARCH_CSS + SAVED_CSS;
    document.head.appendChild(s);
}

function renderSavedSearches(container: HTMLElement, input: HTMLInputElement): void {
    container.innerHTML = '';
    const searches = loadSearches();
    for (let i = 0; i < searches.length; i++) {
        const q = searches[i];
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
            chip.remove();
        };
        chip.appendChild(x);
        chip.onclick = () => {
            input.value = q;
            // Trigger search
            window.location.href = 'https://hitomi.la/search.html?' + encodeURIComponent(q);
        };
        container.appendChild(chip);
    }
}

export function buildPage(): HTMLElement | null {
    const searchDiv = document.getElementById('search');
    const searchBtn = document.getElementById('search-button');
    if (!searchDiv || !searchBtn) return null;

    document.body.innerHTML = '';
    document.body.style.cssText = 'background:#000;color:#fff;font-family:sans-serif;margin:0;overflow-x:hidden';

    injectSearchCSS();
    const s = document.createElement('style');
    s.textContent = rowCSS;
    document.head.appendChild(s);

    const wrap = document.createElement('div');
    wrap.id = 'hs-wrap';
    wrap.style.cssText = 'width:100%;background:#111';
    wrap.appendChild(searchDiv);
    wrap.appendChild(searchBtn);

    // Saved searches container
    const savedContainer = document.createElement('div');
    savedContainer.className = 'hs-saved-searches';
    wrap.appendChild(savedContainer);

    searchDiv.onmousedown = function (e) {
        if ((e.target as HTMLElement).id !== 'query-input') e.stopPropagation();
    };
    searchDiv.onmouseup = function (e) {
        if ((e.target as HTMLElement).id !== 'query-input') e.stopPropagation();
    };

    document.body.appendChild(wrap);

    // Intercept Enter key on search input
    const input = document.getElementById('query-input') as HTMLInputElement;
    if (input) {
        input.onkeydown = function (e) {
            if (e.key === 'Enter') {
                const val = input.value.trim();
                if (val) {
                    addSearch(val);
                }
                // Let the default navigation happen
            }
        };
        // Render saved searches
        renderSavedSearches(savedContainer, input);
    }

    const grid = document.createElement('div');
    grid.style.cssText = 'width:100%';
    document.body.appendChild(grid);

    return grid;
}
