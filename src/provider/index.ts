export { Handler } from './types';
export type { GalleryMeta, Provider, RouteMatch } from './types';

import type { Provider } from './types';
import { provider as hitomi } from './hitomi';

export const providers = { hitomi } as const;
export type ProviderName = keyof typeof providers;

let p: Provider = hitomi;

export function init(which: ProviderName): void {
    p = providers[which];
}

// ── lazy forwarders ──────────────────────────────────────────────────

export const fetchMeta = (gid: number) => p.fetchMeta(gid);
export const thumbUrl = (file: { hash: string }) => p.thumbUrl(file);
export const imageUrl = (gid: number, pageIndex: number) => p.imageUrl(gid, pageIndex);
export const searchGalleries = (term: string) => p.searchGalleries(term);
export const readerUrl = (gid: number, index?: number) => p.readerUrl(gid, index);
export const searchUrl = (query: string) => p.searchUrl(query);

// Constants become getter functions so the value tracks the active provider
export const initProvider = () => p.init();
export const itemsPerPage = () => p.itemsPerPage;
