import { Handler, type Provider, type Thumbnail } from '../types';
import { computeRequest } from '../../core/compute/transport';
import { scheduleFavoritesSync } from './favorites-sync';
import { galleryHomeBackup } from '../../storage/backup';
import { DOMAIN, LANG_PARAM } from './constants';
import { buildImhentaiSearchUrl } from './decoder';

export const provider: Provider = {
    backupHome: galleryHomeBackup('imhentai', () => scheduleFavoritesSync(0)),
    scheduleFavoritesSync,
    matchRoute(pathname: string, search: string, _hash: string) {
        if (pathname === '/' || pathname === '') {
            return { handler: Handler.Home };
        }

        if (pathname.startsWith('/search/')) {
            const params = new URLSearchParams(search);
            const key = params.get('key') ?? '';
            const page = parseInt(params.get('page') ?? '1');
            const enabled = Object.entries(LANG_PARAM).filter(([, code]) => params.get(code) === '1');
            if (enabled.length === 1) {
                const [name] = enabled[0];
                const query = key ? `${key},language:${name}` : `language:${name}`;
                return { handler: Handler.Search, query, page };
            }
            return { handler: Handler.Search, query: key, page };
        }

        const tagPages: Record<string, string> = {
            '/tag/': 'tag',
            '/language/': 'language',
            '/artist/': 'artist',
            '/parody/': 'parody',
            '/category/': 'category',
            '/character/': 'character',
            '/group/': 'group',
        };

        for (const [prefix, ns] of Object.entries(tagPages)) {
            if (pathname.startsWith(prefix)) {
                const name = decodeURIComponent(pathname.slice(prefix.length)).replace(/\/$/, '').replace(/-/g, ' ');
                const params = new URLSearchParams(search);
                const page = parseInt(params.get('page') ?? '1');
                return { handler: Handler.Search, query: ns === 'tag' ? name : `${ns}:${name}`, page };
            }
        }

        if (pathname.startsWith('/view/')) {
            const parts = pathname.replace(/^\/view\//, '').replace(/\/$/, '').split('/');
            const gid = Number(parts[0]);
            const page = parts.length >= 2 ? parseInt(parts[1]) : 1;
            if (!isNaN(gid)) return { handler: Handler.Reader, gid, index: page - 1 };
        }

        return null;
    },

    search: (query, page) => computeRequest('provider', { provider: 'imhentai', method: 'search', args: [query, page] }),
    getMeta: gid => computeRequest('provider', { provider: 'imhentai', method: 'getMeta', args: [gid] }),
    getGalleryThumbnails: gid => computeRequest('provider', { provider: 'imhentai', method: 'getGalleryThumbnails', args: [gid] }),
    getReaderData: gid => computeRequest('provider', { provider: 'imhentai', method: 'getReaderData', args: [gid] }),
    imageUrls: images => computeRequest('provider', { provider: 'imhentai', method: 'imageUrls', args: [images] }),
    readerUrl(gid: number, index?: number): string {
        if (index !== undefined) return `https://${DOMAIN}/view/${gid}/${index + 1}/`;
        return `https://${DOMAIN}/view/${gid}/1/`;
    },

    searchUrl(rawQuery: string, page?: number): string {
        return buildImhentaiSearchUrl(rawQuery, page);
    },

    tagSearchUrl(ns: string, value: string, language: string): string {
        const query = ns === 'language' ? `language:${value}` : `language:${language},${value}`;
        return buildImhentaiSearchUrl(query);
    },


    thumbUrl: (thumb: Thumbnail) => (thumb as { url: string }).url,
};
