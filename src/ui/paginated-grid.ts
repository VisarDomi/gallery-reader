import {createSkeletonRow, populateRow} from "./gallery-row";
import {fetchMeta, itemsPerPage} from "../provider";

interface PageInfo {
    totalCount: string;
    currentPage: number;
    totalPages: number;
}

export function renderPaginatedGrid(
    ids: number[],
    page: number,
    countLabel: string,
    onPageChange: (page: number) => void,
): PageInfo {
    const totalPages = Math.max(1, Math.ceil(ids.length / itemsPerPage));
    const currentPage = Math.min(page, totalPages);
    const start = (currentPage - 1) * itemsPerPage;
    const pageIds = ids.slice(start, start + itemsPerPage);

    const pageInfo: PageInfo = {
        totalCount: String(ids.length) + countLabel,
        currentPage,
        totalPages,
    };

    document.querySelectorAll('.hs-page-bar').forEach(el => el.remove());
    const grid = document.getElementById('hs-grid') as HTMLDivElement;

    renderInfoBar(pageInfo, grid);
    renderGridRows(grid, pageIds);
    renderPaginationBar(pageInfo, onPageChange, grid);
    grid.scrollIntoView();

    return pageInfo;
}

function renderInfoBar(info: PageInfo, grid: HTMLElement): void {
    const el = document.createElement('div');
    el.className = 'hs-page-bar';
    el.textContent = info.totalCount;
    if (grid.parentNode) grid.parentNode.insertBefore(el, grid);
}

function renderPaginationBar(
    info: PageInfo,
    onPage: (page: number) => void,
    grid: HTMLElement,
): void {
    const pag = document.createElement('div');
    pag.className = 'hs-page-bar hs-page-bar-pag';

    // Favs link at position 0
    const favs = document.createElement('a');
    favs.href = '/';
    favs.textContent = 'Favs';
    favs.className = 'hs-page-favs';
    pag.appendChild(favs);

    for (let pageNum = 1; pageNum <= info.totalPages; pageNum++) {
        if (pageNum === info.currentPage) {
            const cur = document.createElement('span');
            cur.textContent = String(pageNum);
            cur.className = 'hs-page-active';
            pag.appendChild(cur);
        } else {
            const pageLink = document.createElement('span');
            pageLink.textContent = String(pageNum);
            pageLink.className = 'hs-page-link';
            pageLink.onclick = () => { onPage(pageNum); };
            pag.appendChild(pageLink);
        }
    }

    if (grid.parentNode) grid.parentNode.insertBefore(pag, grid.nextSibling);
}

export function renderGridRows(grid: HTMLElement, ids: number[]): void {
    grid.innerHTML = '';

    const rows: HTMLDivElement[] = [];
    for (let i = 0; i < ids.length; i++) {
        const row = createSkeletonRow();
        rows.push(row);
        grid.appendChild(row);
    }

    for (let i = 0; i < ids.length; i++) {
        const gid = ids[i];
        const row = rows[i];

        void fetchMeta(gid)
            .then(meta => populateRow(row, gid, meta.files))
            .catch(() => {
                const err = document.createElement('div');
                err.className = 'hs-grid-error';
                err.textContent = 'Failed to load gallery ' + gid;
                row.appendChild(err);
            });
    }
}
