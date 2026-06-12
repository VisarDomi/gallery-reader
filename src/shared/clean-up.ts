const SEARCH_DOMAIN = 'ltn.gold-usergeneratedcontent.net';

export function loadScript(src: string): Promise<void> {
    const { promise, resolve } = Promise.withResolvers<void>();
    const scriptEl = document.createElement('script');
    scriptEl.src = `https://${SEARCH_DOMAIN}/${src}`;
    scriptEl.onload = () => resolve();
    document.head.appendChild(scriptEl);
    return promise;
}

const SEARCH_CSS = 'body{font-size:16px}#search-button{display:none}#search:after{display:none}' +
    '#hs-wrap{width:100%!important}' +
    '#hs-wrap #search,#hs-wrap .search-input{width:100%!important;max-width:none!important;display:block!important}' +
    '#hs-wrap #query-input{width:100%!important;min-width:100%!important;font-size:16px;box-sizing:border-box}';

export function cleanDocument() {
    // Nuke everything — inline ad scripts die here
    window.stop();
    document.documentElement.innerHTML = '';
    document.body.style.background = '#000';
    document.body.style.margin = '0';
    document.body.style.fontSize = '16px';
    document.body.style.setProperty('overflow', 'visible', 'important');
    document.documentElement.style.scrollBehavior = 'auto';
}

export async function cleanUp(): Promise<void> {
    // Save search elements from server-rendered HTML before any scripts execute
    const search = document.getElementById('search');
    const searchBtn = document.getElementById('search-button');

    cleanDocument();
    const header = document.createElement('div');
    header.id = 'hs-wrap';
    const styleEl = document.createElement('style');
    styleEl.textContent = SEARCH_CSS;
    document.head.appendChild(styleEl);
    header.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px;background:#111';

    if (search) header.appendChild(search);
    if (searchBtn) header.appendChild(searchBtn);
    document.body.appendChild(header);

    // Grid placeholder
    const grid = document.createElement('div');
    grid.id = 'hs-grid';
    grid.style.cssText = 'width:100%';
    document.body.appendChild(grid);

    // Load only search scripts — no ads, no gallery cruft
    await loadScript('jquery.min.js');
    await loadScript('common.js');
    await loadScript('searchlib.js');
    await loadScript('search.js');
}
