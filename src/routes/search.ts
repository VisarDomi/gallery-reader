import { search, searchUrl } from '../provider';
import { initShell } from '../ui/shell';
import { renderPaginatedGrid } from "../ui/paginated-grid";
import { saveSearch, applyPendingScroll } from "../storage/preferences";
import { render as renderSavedSearch} from "../ui/saved-searches";

async function render(result: { galleryIds: number[]; totalResults: number; pageSize: number }, page: number, query: string): Promise<void> {
    const pageInfo = renderPaginatedGrid(
        result.galleryIds,
        page,
        result.totalResults,
        result.pageSize,
        ' Results',
        (newPage) => paginate(query, newPage),
    );

    const url = searchUrl(query, pageInfo.currentPage);
    history.replaceState(null, '', url);
    await saveSearch(query, pageInfo.currentPage);
    await renderSavedSearch();
}

async function paginate(query: string, page: number) {
    const result = await search(query, page);
    await render(result, page, query);
}

export async function init(query: string, page: number): Promise<void> {
    await initShell(query);
    await paginate(query, page);
    applyPendingScroll();
}
