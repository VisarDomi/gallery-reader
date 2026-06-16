import {getAllFavs} from '../hitomi/db';
import {initShell} from '../shared/shell';
import {renderPaginatedGrid} from "../shared/paginated-grid";

const STORAGE_KEY = 'hitomi_favs_page';
const COUNT_KEY = ' Favorites';

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
    const pageInfo = renderPaginatedGrid(
        ids,
        page,
        COUNT_KEY,
        (newPage) => renderPage(ids, newPage),
    );

    savePage(pageInfo.currentPage);
}

export async function init(): Promise<void> {
    await initShell();
    const ids = await getAllFavs()
    if (ids.length === 0) return;
    renderPage(ids, getPage());
}
