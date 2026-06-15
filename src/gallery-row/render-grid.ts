import {fetchMeta} from '../hitomi/hitomi';
import {createSkeletonRow, populateRow} from './gallery-row';

export function renderGridRows(grid: HTMLElement, ids: number[]): void {
    grid.innerHTML = '';

    // Phase 1: build all skeletons synchronously — stable layout, deterministic order
    const rows: HTMLDivElement[] = [];
    for (let i = 0; i < ids.length; i++) {
        const row = createSkeletonRow();
        rows.push(row);
        grid.appendChild(row);
    }

    // Phase 2: hydrate each row asynchronously — never reorders
    for (let i = 0; i < ids.length; i++) {
        const gid = ids[i];
        const row = rows[i];

        void fetchMeta(gid)
            .then(meta => populateRow(row, gid, meta.files))
            .catch(() => {
                row.innerHTML = '';
                row.style.height = '';
                const err = document.createElement('div');
                err.className = 'hs-grid-error';
                err.textContent = 'Failed to load gallery ' + gid;
                row.appendChild(err);
            });
    }
}
