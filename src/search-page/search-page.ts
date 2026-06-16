import {saveSearch} from '../shared/saved-searches';
import {searchGalleries} from '../hitomi/hitomi';
import {initShell} from '../shared/shell';
import {renderPaginatedGrid} from "../shared/paginated-grid";

function getPage(): number {
    const m = window.location.hash.match(/#(\d+)/);
    return m ? parseInt(m[1]) : 1;
}

function syncInputFromUrl(query: string): void {
    const input = document.getElementById('query-input') as HTMLInputElement;
    if (input && query) input.value = query;
}

async function getIds(query: string): Promise<number[]> {
    const terms = query.split(/\s+/).filter(Boolean);

    const positive: string[] = [];
    const negative: string[] = [];

    for (const term of terms) {
        if (term.startsWith('-')) {
            negative.push(term.slice(1));
        } else {
            positive.push(term);
        }
    }

    let idSet: Set<number> | null = null;

    for (const tag of positive) {
        const ids = await searchGalleries(tag);

        if (idSet === null) {
            idSet = new Set(ids);
        } else {
            idSet = new Set(ids.filter(id => idSet!.has(id)));
        }
    }

    if (!idSet) {
        idSet = new Set(await searchGalleries('language:japanese'));
    }

    for (const tag of negative) {
        const ids = new Set(await searchGalleries(tag));
        idSet = new Set([...idSet].filter(id => !ids.has(id)));
    }

    return [...idSet];
}

const COUNT_KEY = ' Results';

function renderPage(ids: number[], page: number, query: string): void {
    const pageInfo = renderPaginatedGrid(
        ids,
        page,
        COUNT_KEY,
        (newPage) => renderPage(ids, newPage, query),
    );

    const hash = '#' + pageInfo.currentPage;
    history.replaceState(null, '', hash);
    saveSearch(query, pageInfo.currentPage);
}

export async function init(): Promise<void> {
    await initShell();
    const query = decodeURIComponent(window.location.search.replace(/^\?/, ''));
    syncInputFromUrl(query);
    window.addEventListener('pagereveal', () => syncInputFromUrl(query)); // ios bfcache
    const ids = await getIds(query);
    renderPage(ids, getPage(), query);
    window.addEventListener('hashchange', () => renderPage(ids, getPage(), query)); // pagination
}
