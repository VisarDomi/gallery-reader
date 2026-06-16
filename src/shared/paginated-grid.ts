import {renderGridRows} from '../gallery-row/render-grid';
import {renderInfoBar, renderPaginationBar, type PageInfo} from '../search-page/pagination';

const HITOMI_ITEMS_PER_PAGE = 25;

export function renderPaginatedGrid(
    ids: number[],
    page: number,
    countLabel: string,
    onPageChange: (page: number) => void,
): PageInfo {
    const totalPages = Math.max(1, Math.ceil(ids.length / HITOMI_ITEMS_PER_PAGE));
    const currentPage = Math.min(page, totalPages);
    const start = (currentPage - 1) * HITOMI_ITEMS_PER_PAGE;
    const pageIds = ids.slice(start, start + HITOMI_ITEMS_PER_PAGE);

    const pageInfo: PageInfo = {
        totalCount: String(ids.length) + countLabel,
        currentPage,
        totalPages,
    };

    const grid = document.getElementById('hs-grid') as HTMLDivElement;
    grid.parentNode?.querySelectorAll('.hs-page-bar').forEach(el => el.remove());

    renderInfoBar(pageInfo, grid);
    renderGridRows(grid, pageIds);
    renderPaginationBar(pageInfo, onPageChange, grid);
    grid.scrollIntoView();

    return pageInfo;
}