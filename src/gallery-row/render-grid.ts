import {render as renderRow} from './gallery-row';
import {fetchMeta} from '../hitomi/hitomi';
import {renderInfo, renderPagination, type PageInfo} from '../search-page/pagination';

const ERR_CSS = 'width:100%;min-height:300px;display:flex;align-items:center;justify-content:center;font-size:16px;color:#f44';

export function renderGrid(
    grid: HTMLElement,
    ids: number[],
    info: PageInfo,
    onPage: (page: number) => void
): void {
    // Remove previous bars
    const prev = grid.parentNode?.querySelectorAll('.hs-page-bar');
    if (prev) for (let i = 0; i < prev.length; i++) prev[i].remove();

    const parent = grid.parentNode;
    if (!parent) return;

    // Top: info + pagination
    const infoEl = renderInfo(info);
    infoEl.className = 'hs-page-bar';
    parent.insertBefore(infoEl, grid);

    const pagTop = renderPagination(info, onPage);
    if (pagTop) {
        pagTop.className = 'hs-page-bar';
        parent.insertBefore(pagTop, grid);
    }

    // Render rows
    grid.innerHTML = '';
    for (let i = 0; i < ids.length; i++) {
        const gid = ids[i];
        fetchMeta(gid).then(meta => {
            grid.appendChild(renderRow(gid, meta.files));
        }).catch(() => {
            const err = document.createElement('div');
            err.style.cssText = ERR_CSS;
            err.textContent = 'Failed to load gallery ' + gid;
            grid.appendChild(err);
        });
    }

    // Bottom: pagination after grid (like GalleryPageView has Pagination at bottom too)
    const pagBot = renderPagination(info, onPage);
    if (pagBot) {
        pagBot.className = 'hs-page-bar';
        parent.insertBefore(pagBot, grid.nextSibling);
    }
}
