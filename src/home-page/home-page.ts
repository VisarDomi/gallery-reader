import {setupSavedSearches, getGrid} from '../shared/saved-searches';
import {renderGridRows} from '../gallery-row/render-grid';
import {getAllFavs} from '../hitomi/db';
import {HITOMI_ITEMS_PER_PAGE, initShell} from '../shared/shell';
import {renderInfoBar, renderPaginationBar, type PageInfo} from '../search-page/pagination';

const STORAGE_KEY = 'hitomi_favs_page';

function getPage(): number {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        const savedPage = parseInt(saved);
        if (!isNaN(savedPage) && savedPage > 0) return savedPage;
    }
    return 1;
}

function savePage(page: number): void {
    localStorage.setItem(STORAGE_KEY, String(page));
}

function renderPage(ids: number[], page: number): void {
    const grid = getGrid();
    const totalPages = Math.max(1, Math.ceil(ids.length / HITOMI_ITEMS_PER_PAGE));
    const currentPage = Math.min(page, totalPages);
    const start = (currentPage - 1) * HITOMI_ITEMS_PER_PAGE;
    const pageIds = ids.slice(start, start + HITOMI_ITEMS_PER_PAGE);

    const pageInfo: PageInfo = {
        totalCount: String(ids.length) + ' Favorites',
        currentPage,
        totalPages,
    };

    const prev = grid.parentNode?.querySelectorAll('.hs-page-bar');
    if (prev) for (let i = 0; i < prev.length; i++) prev[i].remove();

    renderInfoBar(pageInfo, grid);
    renderGridRows(grid, pageIds);
    renderPaginationBar(pageInfo, (newPage) => {
        savePage(newPage);
        renderPage(ids, newPage);
    }, grid);
}

export async function init(): Promise<void> {
    await initShell();
    setupSavedSearches();
    const ids = await getAllFavs()
    if (ids.length === 0) return;
    renderPage(ids, getPage());
}
