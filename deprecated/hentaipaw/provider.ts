import { Provider, SearchResults, GalleryMeta, GallerySummary, Handler, type Thumbnail, type ReaderImage } from '../types';
import { DOMAIN, CDN, NAMESPACES, type Namespace, PAGE_SIZE } from './constants';
import {
    fetchText,
    fetchArticleHTML,
    fetchViewerHashes,
    parseArticleMeta,
    parseArticleThumbs,
    parseEntityListings,
    parseQuery,
    resolveName,
    resolveId,
    initNameCache,
    type HentaipawThumb,
    type HentaipawImage,
} from './decoder';
// ── language name normalization ───────────────────────────────────────

const LANG_MAP: Record<string, string> = {
    japanese: '日本語',
    english: 'English',
    chinese: '中文',
    russian: 'Русский',
    spanish: 'Español',
    korean: '한국어',
    french: 'Français',
};

function normalizeLang(queryLang: string): string {
    // If already a native name, return as-is
    for (const v of Object.values(LANG_MAP)) {
        if (v === queryLang) return v;
    }
    // Map english name to native
    return LANG_MAP[queryLang.toLowerCase()] ?? queryLang;
}

function extractLastPage(html: string): number {
    const matches = html.matchAll(/\/\?page=(\d+)/g);
    let max = 0;
    for (const m of matches) {
        const n = parseInt(m[1]);
        if (n > max) max = n;
    }
    return max || 39004;
}
export const provider: Provider = {
    name: 'hentaipaw',

    async init(): Promise<void> {
        await initNameCache();
    },

    // ── routing ──────────────────────────────────────────────────────

    async matchRoute(pathname: string, search: string, _hash: string) {
        if (pathname === '/' || pathname === '') {
            const params = new URLSearchParams(search);
            const lang = params.get('lang');
            const page = parseInt(params.get('page') ?? '1');
            if (lang) {
                return { handler: Handler.Search, query: `language:${lang.toLowerCase()}`, page };
            }
            return { handler: Handler.Home };
        }

        // Entity detail: /{namespace}s/{id}?page=N&lang=Language
        for (const ns of NAMESPACES) {
            const prefix = `/${ns}s/`;
            if (pathname.startsWith(prefix)) {
                const idStr = pathname.slice(prefix.length).split('?')[0].split('/')[0];
                const id = parseInt(idStr);
                if (isNaN(id)) continue;

                const params = new URLSearchParams(search);
                const page = parseInt(params.get('page') ?? '1');
                const lang = params.get('lang') ?? '';

                const name = await resolveId(ns, id);
                const query = lang
                    ? `${ns}:${name.replace(/ /g, '_')} language:${lang}`
                    : `${ns}:${name.replace(/ /g, '_')}`;

                return { handler: Handler.Search, query, page };
            }
        }

        // Reader: /viewer?articleId={id}&page=N
        if (pathname.startsWith('/viewer')) {
            const params = new URLSearchParams(search);
            const articleId = parseInt(params.get('articleId') ?? '');
            const viewerPage = parseInt(params.get('page') ?? '1');
            if (!isNaN(articleId)) {
                return { handler: Handler.Reader, gid: articleId, index: viewerPage - 1 };
            }
        }

        return null;
    },

    // ── search ────────────────────────────────────────────────────────

    async search(rawQuery: string, page: number): Promise<SearchResults> {
        const { namespace, value, language } = parseQuery(rawQuery);
        if (!namespace || !value) {
            const nativeLang = language ? normalizeLang(language) : '';
            const html = await fetchText(`https://${DOMAIN}/?page=${page}`);
            const listings = parseEntityListings(html);
            const filtered = language
                ? listings.filter(l => l.language === nativeLang)
                : listings;

            // Get site total from "last page" link to mirror site pagination 1:1
            const lastPage = extractLastPage(html);

            return {
                galleryIds: filtered.map(l => l.articleId),
                totalResults: lastPage * PAGE_SIZE,
                pageSize: PAGE_SIZE,
            };
        }

        const entityId = await resolveName(namespace, value);
        const nativeLang = language ? normalizeLang(language) : '';

        const allIds: number[] = [];
        let p = 1;
        while (true) {
            const html = await fetchText(`https://${DOMAIN}/${namespace}s/${entityId}?page=${p}`);
            const listings = parseEntityListings(html);
            if (listings.length === 0) break;
            const filtered = language
                ? listings.filter(l => l.language === nativeLang)
                : listings;
            for (const l of filtered) allIds.push(l.articleId);
            if (listings.length < PAGE_SIZE) break;
            p++;
        }

        const start = (page - 1) * PAGE_SIZE;
        return {
            galleryIds: allIds.slice(start, start + PAGE_SIZE),
            totalResults: allIds.length,
            pageSize: PAGE_SIZE,
        };
    },

    // ── gallery summary (search grid) ─────────────────────────────────

    async getGallerySummary(gid: number): Promise<GallerySummary> {
        const html = await fetchArticleHTML(gid);
        const thumbs = parseArticleThumbs(html, gid);
        return { pageCount: thumbs.length, thumbs };
    },

    // ── metadata (info modal) ─────────────────────────────────────────

    async getMeta(gid: number): Promise<GalleryMeta> {
        const html = await fetchArticleHTML(gid);
        const thumbs = parseArticleThumbs(html, gid);
        return parseArticleMeta(html, thumbs.length);
    },

    // ── reader data ───────────────────────────────────────────────────

    async getReaderData(gid: number): Promise<{ images: ReaderImage[]; meta: GalleryMeta }> {
        const html = await fetchArticleHTML(gid);
        const thumbs = parseArticleThumbs(html, gid);
        const meta = parseArticleMeta(html, thumbs.length);

        // Resolve dimensions via <img> loading (CDN blocks fetch(), <img> works)
        const images: HentaipawImage[] = [];
        const dimPromises: Promise<void>[] = [];

        for (const thumb of thumbs) {
            const img: HentaipawImage = { articleId: gid, pageNum: thumb.pageNum, width: 0, height: 0 };
            images.push(img);
            const url = `https://${CDN}/${gid}/thumbnails/${thumb.pageNum}.${thumb.ext}`;
            dimPromises.push(new Promise<void>(resolve => {
                const el = document.createElement('img');
                el.onload = () => { img.width = el.naturalWidth; img.height = el.naturalHeight; resolve(); };
                el.onerror = () => resolve();
                el.src = url;
            }));
        }

        await Promise.all(dimPromises);
        images.sort((a, b) => a.pageNum - b.pageNum);
        return { images, meta };
    },
    // ── URL constructors ──────────────────────────────────────────────

    readerUrl(gid: number, index?: number): string {
        const p = index !== undefined ? index + 1 : 1;
        return `https://${DOMAIN}/viewer?articleId=${gid}&page=${p}`;
    },

    async searchUrl(rawQuery: string, page?: number): Promise<string> {
        const { namespace, value, language } = parseQuery(rawQuery);

        if (!namespace || !value) {
            let url = `https://${DOMAIN}/?`;
            if (language) url += `lang=${language.charAt(0).toUpperCase() + language.slice(1)}&`;
            url += `page=${page ?? 1}`;
            return url;
        }
        const id = await resolveName(namespace, value);
        let url = `https://${DOMAIN}/${namespace}s/${id}`;
        if (page && page > 1) url += `?page=${page}`;
        if (language) {
            const sep = url.includes('?') ? '&' : '?';
            url += `${sep}lang=${language.charAt(0).toUpperCase() + language.slice(1)}`;
        }
        return url;
    },

    async tagSearchUrl(ns: string, value: string, language: string): Promise<string> {
        if (ns === 'language') {
            return `https://${DOMAIN}/?lang=${value.charAt(0).toUpperCase() + value.slice(1)}`;
        }
        const id = await resolveName(ns as Namespace, value);
        let url = `https://${DOMAIN}/${ns}s/${id}`;
        if (language) url += `?lang=${language.charAt(0).toUpperCase() + language.slice(1)}`;
        return url;
    },

    thumbUrl(thumb: Thumbnail): string {
        const t = thumb as HentaipawThumb;
        return `https://${CDN}/${t.articleId}/thumbnails/${t.pageNum}.${t.ext}`;
    },

    async imageUrls(images: ReaderImage[]): Promise<string[]> {
        if (images.length === 0) return [];

        const first = images[0] as HentaipawImage;
        const hashes = await fetchViewerHashes(first.articleId);

        return images.map(img => {
            const hi = img as HentaipawImage;
            const hash = hashes[hi.pageNum];
            if (!hash) return '';
            return `https://${CDN}/${hi.articleId}/${hash}/${hi.pageNum}.webp`;
        });
    },
};
