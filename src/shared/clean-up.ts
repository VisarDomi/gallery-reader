const SEARCH_DOMAIN = 'ltn.gold-usergeneratedcontent.net';

export function loadScript(src: string): Promise<void> {
    const { promise, resolve } = Promise.withResolvers<void>();
    const scriptEl = document.createElement('script');
    scriptEl.src = `https://${SEARCH_DOMAIN}/${src}`;
    scriptEl.onload = () => resolve();
    document.head.appendChild(scriptEl);
    return promise;
}

const SEARCH_CSS =
    // Dark theme base
    '#hs-wrap{width:100%!important}' +
    // Input fills available space
    '.hs-search-input{position:relative;flex:1;min-width:0}' +
    '.hs-search-input #query-input{display:block;width:100%;height:30px;padding:4px 4px 4px 8px;box-sizing:border-box;' +
    'font-size:16px;border:1px solid #555;background:#222;color:#ddd;outline:none}' +
    // Suggestions dropdown — hidden until .active toggled by search.js
    '#search-suggestions{display:none;position:absolute;margin:5px 0 0 0;padding:0;width:100%;' +
    'z-index:99999;list-style:none;outline:1px solid #4488bb}' +
    '.active #search-suggestions,#search-suggestions:not(:empty){display:block}' +
    '#search-suggestions li{background:#222;position:relative;border-bottom:1px solid #333}' +
    '#search-suggestions li:last-child{border-bottom:none}' +
    '#search-suggestions li a{text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
    'color:#bbb;padding:6px 8px;display:block;width:calc(100% - 56px)}' +
    '.search-suggestion strong{color:#6af}' +
    '.search-ns{color:#777}' +
    '.search-suggestion_total{position:absolute;right:8px;top:6px;color:#666;font-size:12px}' +
    '.selected{background-color:#2a2a4a!important}' +
    // Button — hidden, search.js binds Enter to it
    '#search-button{display:none}';

export function cleanDocument() {
    document.open();
    document.write('<!DOCTYPE html><html><head></head><body></body></html>');
    document.close();
    document.body.style.background = '#000';
    document.body.style.margin = '0';
    document.body.style.fontFamily = "'SF Pro Display', 'SF Pro Text', -apple-system, sans-serif";
    document.body.style.fontSize = '16px';
    document.body.style.setProperty('overflow', 'visible', 'important');
    document.documentElement.style.scrollBehavior = 'auto';
}

export async function cleanUp(): Promise<void> {
    cleanDocument();

    const header = document.createElement('div');
    header.id = 'hs-wrap';
    header.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px;background:#111';

    // Wrapper with position:relative so absolute dropdown anchors correctly.
    // search.js toggles .active on #query-input's parent — this div.
    const searchWrap = document.createElement('div');
    searchWrap.className = 'hs-search-input';

    const input = document.createElement('input');
    input.type = 'text';
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

    const styleEl = document.createElement('style');
    styleEl.textContent = SEARCH_CSS;
    document.head.appendChild(styleEl);
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


    // Block ad injections into body. Our elements all have hs-* classes.
    new MutationObserver(mutations => {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (!(node instanceof Element)) continue;
                const tag = node.tagName;
                const cls = (node as Element).className;
                if (tag === 'SCRIPT' || tag === 'IFRAME' || tag === 'INS') {
                    node.remove();
                } else if (tag === 'DIV' && typeof cls === 'string' && cls.length > 0 && !cls.startsWith('hs-')) {
                    node.remove();
                }
            }
        }
    }).observe(document.body, { childList: true });
}
