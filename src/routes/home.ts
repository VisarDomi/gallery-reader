import {getAllFavs} from '../storage/db';
import {initShell} from '../ui/shell';
import {renderPaginatedGrid} from "../ui/paginated-grid";
import {getPage, savePage} from "../storage/localstorage";

const COUNT_KEY = ' Favorites';

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
