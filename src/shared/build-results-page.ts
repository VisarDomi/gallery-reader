import {CSS as rowCSS} from '../gallery-row/gallery-row';
import {addSearch, loadSearches, removeSearch} from './saved-searches';

const SAVED_CSS = '.hs-saved-searches{display:flex;flex-wrap:wrap;gap:6px;padding:6px 4px}' +
    '.hs-saved-chip{background:#222;color:#888;padding:4px 8px;border-radius:4px;font-size:16px;cursor:pointer;display:flex;align-items:center;gap:6px;border:none}' +
    '.hs-saved-chip:hover{color:#fff}' +
    '.hs-saved-chip .hs-saved-x{color:#555;font-size:16px;line-height:1}' +
    '.hs-saved-chip .hs-saved-x:hover{color:#f44}';
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

export function buildGrid(): HTMLElement | null {
    const styleEl = document.createElement('style');
    styleEl.textContent = SAVED_CSS + rowCSS;
    document.head.appendChild(styleEl);

    // Saved searches below the header (header already populated by cleanUp)
    const savedContainer = document.createElement('div');
    savedContainer.className = 'hs-saved-searches';
    const header = document.body.firstElementChild;
    if (header) header.insertAdjacentElement('afterend', savedContainer);

    const input = document.getElementById('query-input') as HTMLInputElement;
    if (input) {
        input.onkeydown = function (e) {
            if (e.key === 'Enter') {
                const val = input.value.trim();
                if (val) addSearch(val);
            }
        };
        renderSavedSearches(savedContainer, input);
    }

    return document.getElementById('hs-grid');
}
