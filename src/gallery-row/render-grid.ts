import {fetchMeta} from '../hitomi/hitomi';
import {createSkeletonRow, populateRow} from './gallery-row';

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
