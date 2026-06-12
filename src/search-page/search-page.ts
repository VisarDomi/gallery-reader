import {buildPage} from '../shared/build-results-page';
import {renderGrid} from '../gallery-row/render-grid';
import {type PageInfo} from './pagination';
import {HITOMI_ITEMS_PER_PAGE} from "../shared/constants";

function extractIds(): number[] {
    const gc = document.querySelector('.gallery-content');
    if (!gc) return [];
    const ids: number[] = [];
    for (let i = 0; i < gc.children.length; i++) {
        const link = gc.children[i].querySelector('a');
        if (link) {
            const parts = link.href.split('-');
            const last = parts[parts.length - 1];
            const id = parseInt(last.replace('.html', ''));
            if (!isNaN(id)) ids.push(id);
        }
    }
    return ids;
}

function parseCount(text: string): number {
    const m = text.match(/^([\d,]+)/);
    return m ? parseInt(m[1].replace(/,/g, '')) : 0;
}

function currentPageNum(): number {
    const m = window.location.hash.match(/#(\d+)/);
    return m ? parseInt(m[1]) : 1;
}

function extractPageInfo(): PageInfo {
    const countEl = document.getElementById('number-of-results');
    const countText = countEl && countEl.textContent && countEl.textContent.trim().length > 0
        ? countEl.textContent.trim()
        : null;

    if (!countText) {
        throw new Error('number-of-results not found');
    }

    const n = parseCount(countText);
    const totalPages = n > 0 ? Math.max(1, Math.ceil(n / HITOMI_ITEMS_PER_PAGE)) : 1;
    const currentPage = currentPageNum();
    return {totalCount: countText, currentPage, totalPages};
}

let retryCount = 0;

export function init(): void {
    const ids = extractIds();
    if (ids.length === 0) { retryCount++; setTimeout(init, 200); return; }

    const countEl = document.getElementById('number-of-results');
    const hasCount = countEl && countEl.textContent && countEl.textContent.trim().length > 0;

    if (!hasCount) {
        retryCount++;
        setTimeout(init, 200);
        return;
    }

    retryCount = 0;

    let pageInfo: PageInfo;
    try {
        pageInfo = extractPageInfo();
    } catch (e) {
        document.body.innerHTML = '<div style="color:#f44;padding:20px;font-size:16px;text-align:center">Failed to load search results</div>';
        return;
    }

    const grid = buildPage();
    if (!grid) return;

    renderGrid(grid, ids, pageInfo, (page) => {
        location.hash = '#' + page;
        location.reload();
    });
}
