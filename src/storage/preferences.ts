import { computeRequest } from '../core/compute/transport';
import type { SavedSearch } from '../core/compute/state';
export const loadSearches = () => computeRequest<SavedSearch[]>('searches');
export const saveSearch = (query: string, page: number) => computeRequest<void>('search-save', { query, page });
export const removeSearch = (query: string) => computeRequest<void>('search-remove', query);
export const getPage = () => computeRequest<number>('page');
export const savePage = (page: number) => computeRequest<void>('page-save', page);
export const saveScrollPosition = (key: string, y: number) => computeRequest<void>('scroll-save', { key, y });
export const loadScrollPosition = (key: string) => computeRequest<number | null>('scroll', key);
let pendingScroll: number | null = null;
let restoreFrame = 0;
let restoreCancelled = false;
const intentEvents = ['pointerdown', 'touchstart', 'wheel', 'keydown'] as const;
function stopWatchingScrollIntent(): void {
    for (const type of intentEvents) window.removeEventListener(type, cancelScrollRestore, true);
}
function cancelScrollRestore(): void {
    restoreCancelled = true;
    pendingScroll = null;
    cancelAnimationFrame(restoreFrame);
    restoreFrame = 0;
    stopWatchingScrollIntent();
}
/** Observe from shell creation, before asynchronous storage or search work. */
export function beginScrollRestore(): void {
    cancelScrollRestore();
    restoreCancelled = false;
    for (const type of intentEvents) window.addEventListener(type, cancelScrollRestore, { capture: true, passive: true });
}
export function deferScrollRestore(y: number): void { if (!restoreCancelled) pendingScroll = y; }
export function applyPendingScroll(): void {
    if (pendingScroll === null) { stopWatchingScrollIntent(); return; }
    const y = pendingScroll;
    pendingScroll = null;
    restoreFrame = requestAnimationFrame(() => {
        restoreFrame = 0;
        stopWatchingScrollIntent();
        if (!restoreCancelled) window.scrollTo(0, y);
    });
}
