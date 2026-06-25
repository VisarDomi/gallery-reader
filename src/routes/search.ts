import { search, searchUrl, goToPage, providerName } from '../provider';
import { initShell } from '../ui/shell';
import { renderPaginatedGrid } from "../ui/paginated-grid";
import { saveSearch, saveScrollPosition, loadScrollPosition, deferScrollRestore, applyPendingScroll } from "../storage/localstorage";
import { render as renderSavedSearch} from "../ui/saved-searches";

const COUNT_KEY = ' Results';

function syncInputFromUrl(query: string): void {
    const input = document.getElementById('query-input') as HTMLInputElement;
    input.value = query;
}

async function render(result: { ids: number[]; totalResults: number; pageSize: number }, page: number, query: string): Promise<void> {
    const pageInfo = renderPaginatedGrid(
        result.ids,
        page,
        result.totalResults,
        result.pageSize,
        COUNT_KEY,
        (newPage) => { goToPage(query, newPage); void init(query, newPage); },
    );

    const url = await searchUrl(query, pageInfo.currentPage);
    history.replaceState(null, '', url);
    saveSearch(query, pageInfo.currentPage, providerName(), renderSavedSearch);
}

export async function init(query: string, page: number): Promise<void> {
    await initShell();
    syncInputFromUrl(query);
    window.addEventListener('pagereveal', () => syncInputFromUrl(query));

    // restore scroll position if returning from a reader page
    const urlKey = location.pathname + location.search;
    const savedY = loadScrollPosition(urlKey);
    if (savedY !== null) deferScrollRestore(savedY);

    // save scroll position for when user navigates away
    const saveScroll = () => saveScrollPosition(location.pathname + location.search, window.scrollY);
    window.addEventListener('scrollend', () => {
        setTimeout(saveScroll, 100);
    });
    window.addEventListener('pagehide', saveScroll);

    const result = await search(query, page);
    await render(result, page, query);
    applyPendingScroll();
}
