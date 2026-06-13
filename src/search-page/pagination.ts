// Shows ALL page numbers. Calls onPage(pageNum) when a page is clicked.

export interface PageInfo {
    totalCount: string;
    currentPage: number;
    totalPages: number;
}


export function renderInfoBar(info: PageInfo, grid: HTMLElement): void {
    const el = document.createElement('div');
    el.className = 'hs-page-bar';
    el.textContent = info.totalCount;
    if (grid.parentNode) grid.parentNode.insertBefore(el, grid);
}

export function renderPaginationBar(
    info: PageInfo,
    onPage: (page: number) => void,
    grid: HTMLElement,
): void {
    if (info.totalPages <= 1) return;

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
