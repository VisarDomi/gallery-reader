// Build-selected implementation; all decoding stays in the userscript provider.
import { provider as source } from '@selected-provider';
export * from '../../../src/provider/types';
export const providerId = __IOS_PROVIDER__;
export const getMeta = source.getMeta;
export const getGalleryThumbnails = source.getGalleryThumbnails;
export const getReaderData = source.getReaderData;
export const imageUrls = source.imageUrls;
export const thumbUrl = source.thumbUrl;
export const search = source.search;
export const initProvider = () => source.init?.();
export const backupHome = source.backupHome;
export const scheduleFavoritesSync = source.scheduleFavoritesSync;
export const readerUrl = (id: number, index = 0) => `/?read=${providerId}-${id}&page=${index + 1}`;
export const searchUrl = (query: string, page = 1) => `/?q=${encodeURIComponent(query)}&p=${page}`;
export function tagSearchUrl(ns: string, value: string, language: string) {
    const url = new URL(source.tagSearchUrl(ns, value, language));
    const route = source.matchRoute(url.pathname, url.search, url.hash);
    if (route?.handler !== 1) throw new Error('Provider returned an invalid search route');
    return searchUrl(route.query, route.page);
}
