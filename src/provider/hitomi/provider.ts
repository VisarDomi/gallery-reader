import { Handler, type Provider, type Thumbnail } from '../types';
import { computeRequest } from '../../core/compute/transport';
import { scheduleFavoritesSync } from './favorites-sync';
import { galleryHomeBackup } from '../../storage/backup';
import { setupAutocomplete } from './autocomplete';

export const provider: Provider = {
    backupHome: galleryHomeBackup('hitomi', () => scheduleFavoritesSync(0)),
    scheduleFavoritesSync,
    async init(): Promise<void> {
        setupAutocomplete();
    },
    matchRoute(pathname: string, search: string, hash: string) {
        if (pathname === '/' || pathname.startsWith('/index')) {
            return { handler: Handler.Home };
        }

        const searchPrefixes = ['/search.html', '/tag/', '/artist/', '/group/', '/series/', '/character/', '/type/'];
        if (searchPrefixes.some(prefix => pathname.startsWith(prefix))) {
            const query = decodeURIComponent(search.replace(/^\?/, ''));
            const m = hash.match(/#(\d+)/);
            return { handler: Handler.Search, query, page: m ? parseInt(m[1]) : 1 };
        }

        if (pathname.startsWith('/reader/')) {
            const gid = Number(pathname.slice('/reader/'.length, -'.html'.length));
            // Native Hitomi can rewrite #0 to its one-based #1- form before takeover.
            const native = /^#(\d+)-/.exec(hash);
            const parsed = native ? Number(native[1]) - 1 : hash ? Number(hash.slice(1)) : 0;
            const index = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
            return { handler: Handler.Reader, gid, index };
        }

        return null;
    },


    search: (query, page) => computeRequest('provider', { provider: 'hitomi', method: 'search', args: [query, page] }),
    getMeta: gid => computeRequest('provider', { provider: 'hitomi', method: 'getMeta', args: [gid] }),
    getGalleryThumbnails: gid => computeRequest('provider', { provider: 'hitomi', method: 'getGalleryThumbnails', args: [gid] }),
    getReaderData: gid => computeRequest('provider', { provider: 'hitomi', method: 'getReaderData', args: [gid] }),
    imageUrls: images => computeRequest('provider', { provider: 'hitomi', method: 'imageUrls', args: [images] }),
    readerUrl(gid: number, index?: number): string {
        let url = `https://hitomi.la/reader/${gid}.html`;
        if (index !== undefined) url += '#' + index;
        return url;
    },

    searchUrl(query: string, page?: number): string {
        let url = 'https://hitomi.la/search.html?' + encodeURIComponent(query);
        if (page !== undefined) url += '#' + page;
        return url;
    },

    tagSearchUrl(ns: string, value: string, language: string): string {
        let q = '';
        if (language && ns !== 'language') q = 'language:' + language + ' ';
        q += ns + ':' + value.replace(/ /g, '_');
        return this.searchUrl(q);
    },


    thumbUrl: (thumb: Thumbnail) => (thumb as { url: string }).url,
};
