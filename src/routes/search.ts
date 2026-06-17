import {searchGalleries} from '../provider';
import {initShell} from '../ui/shell';
import {renderPaginatedGrid} from "../ui/paginated-grid";
import {parseQuery} from "../core/query-parser";
import {saveSearch} from "../storage/localstorage";
import {render} from "../ui/saved-searches";

const COUNT_KEY = ' Results';

function syncInputFromUrl(query: string): void {
    const input = document.getElementById('query-input') as HTMLInputElement;
    input.value = query;
}

async function getIds(query: string): Promise<number[]> {
    const { positive, negative } = parseQuery(query);

    let idSet: Set<number> | null = null;

    for (const tag of positive) {
        const ids = await searchGalleries(tag);
        if (idSet === null) {
            idSet = new Set(ids);
        } else {
            idSet = new Set(ids.filter(id => idSet!.has(id)));
        }
    }

    for (const tag of negative) {
        const ids = new Set(await searchGalleries(tag));
        idSet = new Set([...idSet!].filter(id => !ids.has(id)));
    }

    return [...idSet!];
}

function renderPage(ids: number[], page: number, query: string): void {
    const pageInfo = renderPaginatedGrid(
        ids,
        page,
        COUNT_KEY,
        (newPage) => renderPage(ids, newPage, query),
    );

    const hash = '#' + pageInfo.currentPage;
    history.replaceState(null, '', hash);
    saveSearch(query, pageInfo.currentPage, render);
}

export async function init(query: string, page: number): Promise<void> {
    await initShell();
    syncInputFromUrl(query);
    window.addEventListener('pagereveal', () => syncInputFromUrl(query)); // ios bfcache
    const ids = await getIds(query);
    renderPage(ids, page, query);
}
