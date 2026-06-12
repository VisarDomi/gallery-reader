import {buildGrid} from '../shared/build-results-page';
import {renderGrid} from '../gallery-row/render-grid';
import {type PageInfo} from './pagination';
import {loadScript} from "../shared/clean-up";
import {HITOMI_ITEMS_PER_PAGE} from "../shared/constants";

declare const results: number[] | undefined;
declare const results_per_page: number;

function currentPageNum(): number {
    const m = window.location.hash.match(/#(\d+)/);
    return m ? parseInt(m[1]) : 1;
}

let grid: HTMLElement | null = null;
let allIds: number[] = [];

function renderPage(page: number): void {
    if (!grid) return;
    const perPage = results_per_page || HITOMI_ITEMS_PER_PAGE;
    const totalPages = Math.max(1, Math.ceil(allIds.length / perPage));
    const currentPage = Math.min(page, totalPages);
    const start = (currentPage - 1) * perPage;
    const pageIds = allIds.slice(start, start + perPage);

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
    await loadScript('results.js');

    allIds = results ?? [];
    if (allIds.length === 0) return;

    grid = buildGrid();

    renderPage(currentPageNum());
}
