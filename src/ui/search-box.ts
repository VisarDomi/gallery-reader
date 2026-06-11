import {CSS as rowCSS} from '../gallery-row/gallery-row';

const SEARCH_CSS = 'body{font-size:16px}#search-button{display:none}#search:after{display:none}' +
    '#hs-wrap{width:100%!important}' +
    '#hs-wrap #search,#hs-wrap .search-input{width:100%!important;max-width:none!important;display:block!important}' +
    '#hs-wrap #query-input{width:100%!important;min-width:100%!important;font-size:16px;box-sizing:border-box}';

function injectSearchCSS(): void {
    const s = document.createElement('style');
    s.textContent = SEARCH_CSS;
    document.head.appendChild(s);
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

    searchDiv.onmousedown = function (e) {
        if ((e.target as HTMLElement).id !== 'query-input') e.stopPropagation();
    };
    searchDiv.onmouseup = function (e) {
        if ((e.target as HTMLElement).id !== 'query-input') e.stopPropagation();
    };

    document.body.appendChild(wrap);

    const grid = document.createElement('div');
    grid.style.cssText = 'width:100%';
    document.body.appendChild(grid);

    return grid;
}
