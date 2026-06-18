export { Handler } from './types';
export type { GalleryMeta, Provider, RouteMatch, SearchPage, GalleryFile } from './types';

import type { Provider } from './types';
import { provider as hitomi } from './hitomi';
import { provider as imhentai } from './imhentai';

export const providers = { hitomi, imhentai } as const;
export type ProviderName = keyof typeof providers;

const HOST = window.location.hostname;
const isHitomi = HOST.includes('hitomi.la');
const isImhentai = HOST.includes('imhentai.xxx') || HOST.includes('hentaizap.com');

const p: Provider = isHitomi ? providers.hitomi : isImhentai ? providers.imhentai : providers.hitomi;
export const providerName = () => p.name;

// ── lazy forwarders ──────────────────────────────────────────────────

export const fetchMeta = (gid: number) => p.fetchMeta(gid);
export const thumbUrl = (file: { hash: string; name: string; width: number; height: number }) => p.thumbUrl(file);
export const imageUrl = (gid: number, pageIndex: number) => p.imageUrl(gid, pageIndex);
export const search = (rawQuery: string, page: number) => p.search(rawQuery, page);
export const readerUrl = (gid: number, index?: number) => p.readerUrl(gid, index);
export const goToPage = (query: string, page: number) => p.goToPage(query, page);
export const searchUrl = (query: string, page?: number) => p.searchUrl(query, page);
export const initProvider = () => p.init();
export const matchRoute = (pathname: string, search: string, hash: string) => p.matchRoute(pathname, search, hash);
