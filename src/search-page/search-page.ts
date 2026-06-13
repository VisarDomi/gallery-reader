import {buildGrid} from '../shared/build-results-page';
import {renderGrid} from '../gallery-row/render-grid';
import {type PageInfo} from './pagination';
import {HITOMI_ITEMS_PER_PAGE} from "../shared/constants";
import {searchGalleries} from "../hitomi/hitomi";

function currentPageNum(): number {
    const m = window.location.hash.match(/#(\d+)/);
    return m ? parseInt(m[1]) : 1;
}

let grid: HTMLElement | null = null;
let allIds: number[] = [];

function renderPage(page: number): void {
    if (!grid) return;
    const totalPages = Math.max(1, Math.ceil(allIds.length / HITOMI_ITEMS_PER_PAGE));
    const currentPage = Math.min(page, totalPages);
    const start = (currentPage - 1) * HITOMI_ITEMS_PER_PAGE;
    const pageIds = allIds.slice(start, start + HITOMI_ITEMS_PER_PAGE);

    const hash = '#' + currentPage;
    if (window.location.hash !== hash) history.replaceState(null, '', hash);

    const pageInfo: PageInfo = {
        totalCount: allIds.length.toLocaleString() + ' Results',
        currentPage,
        totalPages,
    };

    renderGrid(grid, pageIds, pageInfo, (newPage) => renderPage(newPage));
}

export async function init(): Promise<void> {
    const raw = decodeURIComponent(window.location.search.replace(/^\?/, ''));
    const terms = raw.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return;

    grid = buildGrid();

    // Parse: positive, negative, and OR groups (from do_search in results.js)
    const positive: string[] = [];
    const negative: string[] = [];
    const orGroups: string[][] = [[]];

    for (let i = 0; i < terms.length; i++) {
        const term = terms[i];
        if (term === 'or') continue;
        const orPrev = i > 0 && terms[i - 1] === 'or';
        const orNext = i + 1 < terms.length && terms[i + 1] === 'or';
        if (orPrev || orNext) {
            orGroups[orGroups.length - 1].push(term);
            if (!orNext) orGroups.push([]);
            continue;
        }
        if (term.startsWith('-')) {
            negative.push(term.slice(1));
        } else {
            positive.push(term);
        }
    }
    // Remove trailing empty OR group
    if (orGroups[orGroups.length - 1].length === 0) orGroups.pop();

    // Positive terms: intersect all
    const resultSets = await Promise.all(positive.map(t => searchGalleries(t)));
    if (resultSets.length === 0 && orGroups.length === 0) return;

    if (resultSets.length > 0) {
        allIds = resultSets[0];
        for (let i = 1; i < resultSets.length; i++) {
            const set = new Set(resultSets[i]);
            allIds = allIds.filter(id => set.has(id));
        }
    }

    // OR groups: union terms within each group, intersect group with main results
    for (const group of orGroups) {
        const groupResults = await Promise.all(group.map(t => searchGalleries(t)));
        const union = new Set<number>();
        for (const ids of groupResults) {
            for (const id of ids) union.add(id);
        }
        if (allIds.length === 0) {
            allIds = Array.from(union);
        } else {
            allIds = allIds.filter(id => union.has(id));
        }
    }

    // Negative terms: subtract
    for (const negTerm of negative) {
        const negIds = await searchGalleries(negTerm);
        const negSet = new Set(negIds);
        allIds = allIds.filter(id => !negSet.has(id));
    }

    renderPage(currentPageNum());

    window.addEventListener('hashchange', () => renderPage(currentPageNum()));
}
