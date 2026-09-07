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
export function deferScrollRestore(y: number): void { pendingScroll = y; }
export function applyPendingScroll(): void {
    if (pendingScroll === null) return;
    const y = pendingScroll;
    pendingScroll = null;
    requestAnimationFrame(() => window.scrollTo(0, y));
}
