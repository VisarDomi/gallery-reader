import {setupSavedSearches} from '../shared/saved-searches';
import {searchGalleries} from '../hitomi/hitomi';
import {initShell} from '../shared/shell';
import {renderPaginatedGrid} from "../shared/paginated-grid";

function getPage(): number {
    const m = window.location.hash.match(/#(\d+)/);
    return m ? parseInt(m[1]) : 1;
}

function parseTerms(query: string): { positive: string[]; negative: string[]; orGroups: string[][] } {
    const terms = query.split(/\s+/).filter(t => t);
    const positive: string[] = [];
    const negative: string[] = [];
    const orGroups: string[][] = [];
    let currentOrGroup: string[] | null = null;

    for (let i = 0; i < terms.length; i++) {
        const t = terms[i];
        if (t === 'or') continue;
        if (t.startsWith('-')) {
            negative.push(t.slice(1));
            currentOrGroup = null;
            continue;
        }
        const prevOr = i > 0 && terms[i - 1] === 'or';
        const nextOr = i + 1 < terms.length && terms[i + 1] === 'or';
        if (prevOr || nextOr) {
            if (!currentOrGroup) { currentOrGroup = []; orGroups.push(currentOrGroup); }
            currentOrGroup.push(t);
        } else {
            positive.push(t);
            currentOrGroup = null;
        }
    }

    return { positive, negative, orGroups };
}

function syncInputFromUrl(query: string): void {
   const input = document.getElementById('query-input') as HTMLInputElement;
   if (input && query) input.value = query;
}

async function getIds(query: string) {
    const { positive, negative, orGroups } = parseTerms(query);
    let idSet: Set<number> | null = null;
    if (positive.length > 0) {
        for (const tag of positive) {
            const ids = await searchGalleries(tag);
            if (idSet === null) {
                idSet = new Set(ids);
            } else {
                idSet = new Set(ids.filter(id => idSet!.has(id)));
            }
        }
    }
    if (!idSet) idSet = new Set(await searchGalleries('language:japanese'));

    for (const group of orGroups) {
        let groupSet: Set<number> | null = null;
        for (const tag of group) {
            const ids = await searchGalleries(tag);
            if (groupSet === null) {
                groupSet = new Set(ids);
            } else {
                for (const id of ids) groupSet.add(id);
            }
        }
        if (groupSet) idSet = new Set([...idSet].filter(id => groupSet!.has(id)));
    }

    for (const tag of negative) {
        const ids = new Set(await searchGalleries(tag));
        idSet = new Set([...idSet].filter(id => !ids.has(id)));
    }

    return [...idSet];
}

const COUNT_KEY = ' Results';

function renderPage(ids: number[], page: number): void {
    const pageInfo = renderPaginatedGrid(
        ids,
        page,
        COUNT_KEY,
        (newPage) => renderPage(ids, newPage),
    );

    const hash = '#' + pageInfo.currentPage;
    if (window.location.hash !== hash) history.replaceState(null, '', hash);
}

export async function init(): Promise<void> {
    await initShell();
    setupSavedSearches();
    const query = decodeURIComponent(window.location.search.replace(/^\?/, ''));
    syncInputFromUrl(query);
    window.addEventListener('pagereveal', () => syncInputFromUrl(query)); // ios bfcache
    const ids = await getIds(query);
    renderPage(ids, getPage());
    window.addEventListener('hashchange', () => renderPage(ids, getPage())); // pagination
}
