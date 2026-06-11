import {buildPage} from '../ui/search-box';
import {renderGrid} from '../gallery-row/render-grid';
import {getAllFavs} from '../hitomi/db';
import {type PageInfo} from '../search-page/pagination';

const ITEMS_PER_PAGE = 25;
const STORAGE_KEY = 'hitomi_favs_page';

let favGrid: HTMLElement | null = null;
let favAllIds: number[] = [];

function loadPage(): number {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        const n = parseInt(saved);
        if (!isNaN(n) && n > 0) return n;
    }
    return 1;
}

function savePage(page: number): void {
    localStorage.setItem(STORAGE_KEY, String(page));
}

function renderPage(page: number): void {
    if (!favGrid) return;
    const totalPages = Math.max(1, Math.ceil(favAllIds.length / ITEMS_PER_PAGE));
    const cp = Math.min(page, totalPages);
    const start = (cp - 1) * ITEMS_PER_PAGE;
    const pageIds = favAllIds.slice(start, start + ITEMS_PER_PAGE);

    const pageInfo: PageInfo = {
        totalCount: String(favAllIds.length) + ' Favorites',
        currentPage: cp,
        totalPages,
    };

    renderGrid(favGrid, pageIds, pageInfo, (newPage) => {
        savePage(newPage);
        renderPage(newPage);
    });
}

export function init(): void {
    const grid = buildPage();
    if (!grid) { setTimeout(init, 100); return; }
    favGrid = grid;

    getAllFavs().then(allIds => {
        if (allIds.length === 0) return;
        favAllIds = allIds;
        renderPage(loadPage());
    });
}
