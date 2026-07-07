import { search, searchUrl, providerName } from '../provider';
import { initShell } from '../ui/shell';
import { renderPaginatedGrid } from "../ui/paginated-grid";
import { saveSearch, applyPendingScroll } from "../storage/localstorage";
import { render as renderSavedSearch} from "../ui/saved-searches";

async function render(result: { ids: number[]; totalResults: number; pageSize: number }, page: number, query: string): Promise<void> {
    const pageInfo = renderPaginatedGrid(
        result.ids,
        page,
        result.totalResults,
        result.pageSize,
        ' Results',
        (newPage) => { void paginate(query, newPage); },
    );

    const url = await searchUrl(query, pageInfo.currentPage);
    history.replaceState(null, '', url);
    saveSearch(query, pageInfo.currentPage, providerName(), renderSavedSearch);
}

async function paginate(query: string, page: number) {
    const result = await search(query, page);
    await render(result, page, query);
}

export async function init(query: string, page: number): Promise<void> {
    await initShell(query);
    void paginate(query, page)
    applyPendingScroll();
}
