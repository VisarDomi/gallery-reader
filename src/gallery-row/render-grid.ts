import {render as renderRow} from './gallery-row';
import {fetchMeta} from '../hitomi/hitomi';


export function renderGridRows(grid: HTMLElement, ids: number[]): void {
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
}
