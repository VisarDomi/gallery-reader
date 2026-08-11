export { Handler } from './types';
export type { GalleryMeta, Provider, RouteMatch, SearchResults, GallerySummary, Thumbnail, ReaderImage } from './types';

import type { Provider, Thumbnail, ReaderImage, RouteMatch } from './types';
import { provider as hitomi } from './hitomi/provider';
import { provider as imhentai } from './imhentai/provider';

export const providers = { hitomi, imhentai } as const;

let p: Provider;

export function selectProvider(hostname: string): void {
    if (hostname.includes('hitomi.la')) p = providers.hitomi;
    else if (hostname.includes('imhentai.xxx')) p = providers.imhentai;
    else throw Error('Unable to select provider');
}

export interface InitializedProviderRoute {
    route: RouteMatch;
    documentTitle: string;
}

export function initializeProviderRoute(
    hostname: string,
    pathname: string,
    search: string,
    hash: string,
): InitializedProviderRoute | null {
    selectProvider(hostname);
    const route = p.matchRoute(pathname, search, hash);
    if (!route) return null;
    return {
        route,
        documentTitle: document.title,
    };
}

export const providerName = () => p.name;

// ── lazy forwarders ──────────────────────────────────────────────────

export const getMeta = (gid: number) => p.getMeta(gid);
export const getGallerySummary = (gid: number) => p.getGallerySummary(gid);
export const getReaderData = (gid: number) => p.getReaderData(gid);
export const thumbUrl = (thumb: Thumbnail) => p.thumbUrl(thumb);
export const imageUrls = (images: ReaderImage[]) => p.imageUrls(images);
export const search = (rawQuery: string, page: number) => p.search(rawQuery, page);
export const readerUrl = (gid: number, index?: number) => p.readerUrl(gid, index);
export const searchUrl = (query: string, page?: number) => p.searchUrl(query, page);
export const tagSearchUrl = (ns: string, value: string, language: string) => p.tagSearchUrl(ns, value, language);
export const initProvider = () => p.init?.();
