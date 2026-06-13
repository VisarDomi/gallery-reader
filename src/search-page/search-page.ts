import {buildGrid, HITOMI_ITEMS_PER_PAGE} from '../shared/build-results-page';
import {renderGrid} from '../gallery-row/render-grid';
import {searchGalleries} from '../hitomi/hitomi';
import {type PageInfo} from './pagination';

function currentPageNum(): number {
    const m = window.location.hash.match(/#(\d+)/);
    return m ? parseInt(m[1]) : 1;
}

function parseTerms(query: string): { positive: string[]; negative: string[]; orGroups: string[][] } {
    const terms = query.split(/\s+/).filter(t => t);
    const positive: string[] = [];
    const negative: string[] = [];
    const orGroups: string[][] = [];
    let currentOrGroup: string[] | null = null;

    for (let i = 0; i < terms.length; i++) {
        const t = terms[i];
        if (t === 'or') continue;
        if (t.startsWith('-')) {
            negative.push(t.slice(1));
            currentOrGroup = null;
            continue;
        }
        const prevOr = i > 0 && terms[i - 1] === 'or';
        const nextOr = i + 1 < terms.length && terms[i + 1] === 'or';
        if (prevOr || nextOr) {
            if (!currentOrGroup) { currentOrGroup = []; orGroups.push(currentOrGroup); }
            currentOrGroup.push(t);
        } else {
            positive.push(t);
            currentOrGroup = null;
        }
    }

    return { positive, negative, orGroups };
}

export async function init(): Promise<void> {
    const grid = buildGrid();

    const query = decodeURIComponent(window.location.search.replace(/^\?/, ''));
    const input = document.getElementById('query-input') as HTMLInputElement;
    if (input && query) input.value = query;

    const { positive, negative, orGroups } = parseTerms(query);

    let idSet: Set<number> | null = null;
    if (positive.length > 0) {
        for (const tag of positive) {
            const ids = await searchGalleries(tag);
            if (idSet === null) {
                idSet = new Set(ids);
            } else {
                idSet = new Set(ids.filter(id => idSet!.has(id)));
            }
        }
    }
    if (!idSet) idSet = new Set(await searchGalleries('language:japanese'));

    for (const group of orGroups) {
        let groupSet: Set<number> | null = null;
        for (const tag of group) {
            const ids = await searchGalleries(tag);
            if (groupSet === null) {
                groupSet = new Set(ids);
            } else {
                for (const id of ids) groupSet.add(id);
            }
        }
        if (groupSet) idSet = new Set([...idSet].filter(id => groupSet!.has(id)));
    }

    for (const tag of negative) {
        const ids = new Set(await searchGalleries(tag));
        idSet = new Set([...idSet].filter(id => !ids.has(id)));
    }

    const allIds = [...idSet];

    function renderPage(page: number): void {
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

    renderPage(currentPageNum());
    window.addEventListener('hashchange', () => renderPage(currentPageNum()));
}
