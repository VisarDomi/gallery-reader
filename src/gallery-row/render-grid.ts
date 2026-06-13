import {render as renderRow} from './gallery-row';
import {fetchMeta} from '../hitomi/hitomi';
import {renderInfo, renderPagination, type PageInfo} from '../search-page/pagination';


export function renderGrid(
    grid: HTMLElement,
    ids: number[],
    info: PageInfo,
    onPage: (page: number) => void
): void {
    const prev = grid.parentNode?.querySelectorAll('.hs-page-bar');
    if (prev) for (let i = 0; i < prev.length; i++) prev[i].remove();

    const parent = grid.parentNode;
    if (!parent) return;

    // Info bar at top
    const infoEl = renderInfo(info);
    infoEl.className = 'hs-page-bar';
    parent.insertBefore(infoEl, grid);

    grid.innerHTML = '';

    for (let i = 0; i < ids.length; i++) {
        const gid = ids[i];
        fetchMeta(gid).then(meta => {
            grid.appendChild(renderRow(gid, meta.files));
        }).catch(() => {
            const err = document.createElement('div');
            err.className = 'hs-grid-error';
            err.textContent = 'Failed to load gallery ' + gid;
            grid.appendChild(err);
        });
    }

    const pagBot = renderPagination(info, onPage);
    if (pagBot) {
        pagBot.className = 'hs-page-bar';
        parent.insertBefore(pagBot, grid.nextSibling);
    }
}
