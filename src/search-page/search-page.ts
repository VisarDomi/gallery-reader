import {buildGrid, HITOMI_ITEMS_PER_PAGE} from '../shared/build-results-page';
import {loadScript} from '../shared/clean-up';
import {renderGrid} from '../gallery-row/render-grid';
import {type PageInfo} from './pagination';

function currentPageNum(): number {
    const m = window.location.hash.match(/#(\d+)/);
    return m ? parseInt(m[1]) : 1;
}

let grid: HTMLElement | null = null;
let allIds: number[] = [];
declare const results: number[];

function renderPage(page: number): void {
    if (!grid) return;
    const totalPages = Math.max(1, Math.ceil(allIds.length / HITOMI_ITEMS_PER_PAGE));
    const currentPage = Math.min(page, totalPages);
    const start = (currentPage - 1) * HITOMI_ITEMS_PER_PAGE;
    const pageIds = allIds.slice(start, start + HITOMI_ITEMS_PER_PAGE);

    const hash = '#' + currentPage;
    if (window.location.hash !== hash) history.replaceState(null, '', hash);

    const pageInfo: PageInfo = {
        totalCount: allIds.length.toLocaleString() + ' Results',
        currentPage,
        totalPages,
    };

    renderGrid(grid, pageIds, pageInfo, (newPage) => renderPage(newPage));
}

export async function init(): Promise<void> {
    grid = buildGrid();
    await loadScript('results.js');

    // results.js populates the global `results` via do_search()
    const { promise, resolve } = Promise.withResolvers<void>();
    const check = () => {
        if (results.length > 0) {
            allIds = results;
            resolve();
        } else {
            setTimeout(check, 100);
        }
    };
    check();
    await promise;

    // do_search() sets input via jQuery, but may race — set ourselves
    const query = decodeURIComponent(window.location.search.replace(/^\?/, ''));
    const input = document.getElementById('query-input') as HTMLInputElement;
    if (input && query) input.value = query;

    renderPage(currentPageNum());
    window.addEventListener('hashchange', () => renderPage(currentPageNum()));
}
