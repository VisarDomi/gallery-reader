import cssContent from '../css/style.css?inline';
// import { setupDebug } from './debug';


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
    document.write('<!DOCTYPE html><html><head></head><body></body></html>');
    document.close();
    const style = document.createElement('style');
    style.textContent = cssContent;
    document.head.appendChild(style);
}

export async function cleanUp(): Promise<void> {
    cleanDocument();

    const header = document.createElement('div');
    header.id = 'hs-wrap';

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

    document.body.appendChild(header);

    // Grid placeholder
    const grid = document.createElement('div');
    grid.id = 'hs-grid';
    document.body.appendChild(grid);

    await loadScript('jquery.min.js');
    await loadScript('common.js');
    await loadScript('searchlib.js');
    await loadScript('search.js');
    // setupDebug();

    // ── dropdown selection — replaces broken jQuery .bind() handler ─
    const sugg = document.getElementById('search-suggestions')!;
    sugg.addEventListener('click', (e) => {
        const a = (e.target as Element).closest<HTMLAnchorElement>('a.search-suggestion_string');
        if (!a) return;
        e.preventDefault(); // block href="#" navigation
        // don't stopPropagation — document click handler needs to remove .active

        const resultSpan = a.querySelector('.search-result');
        const nsSpan = a.querySelector('.search-ns');
        if (!resultSpan) return;

        const name = resultSpan.textContent?.trim() ?? '';
        const nsText = nsSpan?.textContent?.trim() ?? '';
        const ns = nsText.replace(/^\(|\)$/g, '').trim();

        // Build "namespace:term" (spaces → underscores), matching searchGalleries format
        const underscored = name.replace(/\s/g, '_');
        const term = ns ? `${ns}:${underscored}` : underscored;

        // Replace last whitespace-delimited word, preserving - prefix
        const val = input.value;
        const lastSpace = val.lastIndexOf(' ');
        const prefix = lastSpace >= 0 ? val.substring(0, lastSpace + 1) : '';
        const lastWord = val.substring(lastSpace + 1);
        const dash = lastWord.startsWith('-') ? '-' : '';
        input.value = prefix + dash + term + ' ';
        input.focus();

        // Clear dropdown
        const origClear = (window as any).clear_page as Function | undefined;
        if (origClear) origClear();
    });

    // Block ad injections into body. Our elements all have hs-* classes.
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
