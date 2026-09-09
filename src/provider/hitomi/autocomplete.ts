import { computeRequest } from '../../core/compute/transport';
import type { Suggestion } from './suggestions';

export function setupAutocomplete(): void {
    const input = document.getElementById('query-input') as HTMLTextAreaElement;
    const list = document.createElement('ul');
    list.id = 'search-suggestions';
    list.setAttribute('role', 'listbox');
    input.parentElement!.append(list);
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', list.id);
    let serial = 0;
    let selected = -1;
    function clear(): void {
        serial++;
        selected = -1;
        list.replaceChildren();
        input.setAttribute('aria-expanded', 'false');
    }
    input.addEventListener('input', async () => {
        clear();
        const current = serial;
        const value = input.value;
        const cursor = input.selectionStart;
        const prefix = value.slice(0, cursor);
        const match = /(?:^|\s)(-?)([^\s]+)$/.exec(prefix);
        if (!match || input.selectionStart !== input.selectionEnd) return;
        const term = match[2];
        const start = cursor - term.length - match[1].length;
        const end = cursor + (value.slice(cursor).match(/^\S*/)?.[0].length ?? 0);
        try {
            const results = await computeRequest<Suggestion[]>('hitomi-suggestions', term);
            if (serial !== current || input.value !== value || document.hidden) return;
            for (const result of results) {
                const row = document.createElement('li');
                row.className = 'search-suggestion';
                const link = document.createElement('a');
                link.className = 'search-suggestion_string';
                link.href = '#';
                link.setAttribute('role', 'option');
                const name = document.createElement('span');
                name.className = 'search-result';
                name.textContent = result.name;
                const namespace = document.createElement('span');
                namespace.className = 'search-ns';
                namespace.textContent = ' (' + result.namespace + ')';
                link.append(name, namespace);
                const count = document.createElement('div');
                count.className = 'search-suggestion_total';
                count.textContent = String(result.count);
                link.addEventListener('pointerdown', event => event.preventDefault());
                link.onclick = event => {
                    event.preventDefault();
                    const replacement = match[1] + result.namespace + ':' + result.name.replace(/\s/g, '_') + ' ';
                    input.value = value.slice(0, start) + replacement + value.slice(end).replace(/^\s/, '');
                    const position = start + replacement.length;
                    input.setSelectionRange(position, position);
                    input.focus();
                    clear();
                };
                row.append(link, count);
                list.append(row);
            }
            input.setAttribute('aria-expanded', String(results.length > 0));
        } catch (error) {
            if (serial === current) { clear(); console.error(error); }
        }
    });
    input.addEventListener('keydown', event => {
        if (event.isComposing) return;
        if (event.key === 'Escape') { clear(); return; }
        const links = [...list.querySelectorAll('a')];
        if (!links.length) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            selected = Math.max(0, Math.min(links.length - 1, selected + (event.key === 'ArrowDown' ? 1 : -1)));
            links.forEach((link, index) => link.parentElement!.classList.toggle('selected', index === selected));
        } else if (event.key === 'Enter' && !event.shiftKey && selected >= 0) {
            event.preventDefault();
            links[selected].click();
        }
    }, { capture: true });
    document.addEventListener('pointerdown', event => {
        if (!input.parentElement!.contains(event.target as Node)) clear();
    });
    window.addEventListener('pagehide', clear);
}
