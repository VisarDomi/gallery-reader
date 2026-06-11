// Shows ALL page numbers. Calls onPage(pageNum) when a page is clicked.

export interface PageInfo {
    totalCount: string;
    currentPage: number;
    totalPages: number;
}

const BAR_CSS = 'padding:8px 4px;font-size:16px;color:#888';
const LINK_CSS = 'color:#888;text-decoration:none;padding:2px 6px;display:inline-block;font-size:16px;cursor:pointer';
const ACTIVE_CSS = 'color:#fff;font-weight:bold;text-decoration:none;padding:2px 6px;display:inline-block;font-size:16px';

export function renderInfo(info: PageInfo): HTMLDivElement {
    const el = document.createElement('div');
    el.style.cssText = BAR_CSS;
    el.textContent = info.totalCount;
    return el;
}

export function renderPagination(info: PageInfo, onPage: (page: number) => void): HTMLDivElement | null {
    if (info.totalPages <= 1) return null;

    const pag = document.createElement('div');
    pag.style.cssText = BAR_CSS + ';display:flex;gap:4px;flex-wrap:wrap';

    // Favs link at position 0 — goes to home page
    const favs = document.createElement('a');
    favs.href = '/';
    favs.textContent = 'Favs';
    favs.style.cssText = 'color:#888;text-decoration:none;padding:2px 8px;margin-right:8px;font-size:16px';
    pag.appendChild(favs);

    for (let pi = 1; pi <= info.totalPages; pi++) {
        if (pi === info.currentPage) {
            const cur = document.createElement('span');
            cur.textContent = String(pi);
            cur.style.cssText = ACTIVE_CSS;
            pag.appendChild(cur);
        } else {
            const s = document.createElement('span');
            s.textContent = String(pi);
            s.style.cssText = LINK_CSS;
            s.onclick = () => { onPage(pi); };
            pag.appendChild(s);
        }
    }

    return pag;
}
