import {buildGrid, HITOMI_ITEMS_PER_PAGE} from '../shared/build-results-page';
import {renderGrid} from '../gallery-row/render-grid';
import {getAllFavs} from '../hitomi/db';
import {type PageInfo} from '../search-page/pagination';


const STORAGE_KEY = 'hitomi_favs_page';

let favGrid: HTMLElement | null = null;
let favAllIds: number[] = [];

function loadPage(): number {
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

function renderPage(page: number): void {
    if (!favGrid) return;
    const totalPages = Math.max(1, Math.ceil(favAllIds.length / HITOMI_ITEMS_PER_PAGE));
    const currentPage = Math.min(page, totalPages);
    const start = (currentPage - 1) * HITOMI_ITEMS_PER_PAGE;
    const pageIds = favAllIds.slice(start, start + HITOMI_ITEMS_PER_PAGE);

    const pageInfo: PageInfo = {
        totalCount: String(favAllIds.length) + ' Favorites',
        currentPage,
        totalPages,
    };

    renderGrid(favGrid, pageIds, pageInfo, (newPage) => {
        savePage(newPage);
        renderPage(newPage);
    });
}

export function init(): void {
    favGrid = buildGrid();

    getAllFavs().then(allIds => {
        if (allIds.length === 0) return;
        favAllIds = allIds;
        renderPage(loadPage());
    });
}
