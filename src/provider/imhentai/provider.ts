import {Provider, SearchResults, GalleryMeta, GallerySummary, ReaderImage, Thumbnail, Handler} from '../types';
import {DOMAIN, LANG_PARAM} from "./constants";
import {buildImhentaiSearchUrl, extractAll, extractBetween, fetchText} from "./decoder";

const PAGE_SIZE = 20;
const galleryCache = new Map<number, string>();

interface ImhentaiThumb extends Thumbnail { url: string }
interface ImhentaiImage extends ReaderImage { url: string }

async function fetchGalleryHTML(gid: number): Promise<string> {
    if (galleryCache.has(gid)) return galleryCache.get(gid)!;
    const html = await fetchText(`https://${DOMAIN}/gallery/${gid}/`);
    galleryCache.set(gid, html);
    return html;
}

function parseGalleryHTML(html: string, gid: number): { thumbs: ImhentaiThumb[]; images: ImhentaiImage[]; pageCount: number } {
    const srcM = extractBetween(html, 'data-src="', '"');
    const base = srcM ? srcM.value.substring(0, srcM.value.lastIndexOf('/')) + '/' : '';
    const exts: Record<string, string> = {j: 'jpg', p: 'png', g: 'gif', w: 'webp', a: 'avif'};

    const thumbs: ImhentaiThumb[] = [];
    const images: ImhentaiImage[] = [];

    const jsonM = extractBetween(html, "$.parseJSON('", "'");
    if (jsonM) {
        const data = JSON.parse(jsonM.value) as Record<string, string>;
        const keys = Object.keys(data).sort((a, b) => parseInt(a) - parseInt(b));
        let idx = 1;
        for (const key of keys) {
            const parts = data[key].split(',');
            const ext = exts[parts[0]] ?? 'jpg';
            const url = `${base}${idx}.${ext}`;
            thumbs.push({ url });
            images.push({ url, width: parseInt(parts[1]) || 0, height: parseInt(parts[2]) || 0 });
            idx++;
        }
        return { thumbs, images, pageCount: idx - 1 };
    }

    // Fallback
    const lp = extractBetween(html, 'id="load_pages" value="', '"');
    const count = lp ? parseInt(lp.value) : 0;
    const viewCount = extractAll(html, 'href="/view/' + gid + '/', '"').length;
    const imageCount = count || viewCount;

    for (let i = 1; i <= imageCount; i++) {
        const url = `${base}${i}.jpg`;
        thumbs.push({ url });
        images.push({ url, width: 0, height: 0 });
    }
    return { thumbs, images, pageCount: imageCount };
}

function extractMeta(html: string): Omit<GalleryMeta, 'pageCount'> {
    const h1 = extractBetween(html, '<h1>', '</h1>');
    const title = h1 ? h1.value.replace(/<[^>]*>/g, '').trim() : '';

    const sub = extractBetween(html, 'class="subtitle">', '<');
    const titleJpn = sub ? sub.value.trim() : '';

    const infoStart = html.indexOf('class="galleries_info"');
    const infoEnd = html.indexOf('</ul>', infoStart);
    const chunk = infoStart !== -1 && infoEnd !== -1 ? html.slice(infoStart, infoEnd) : html;

    function extractNS(ns: string): string[] {
        const results: string[] = [];
        let pos = 0;
        while (true) {
            const m = extractBetween(chunk, "href='/" + ns + "/", "'", pos);
            if (!m) break;
            const tagStart = chunk.indexOf('>', m.nextIndex) + 1;
            const tagEnd = chunk.indexOf('</a>', tagStart);
            if (tagEnd === -1) break;
            let tag = chunk.slice(tagStart, tagEnd).replace(/<[^>]*>/g, '').trim();
            tag = tag.replace(/\s+\d+$/, '');
            if (tag) results.push(tag);
            pos = tagEnd;
        }
        return results;
    }

    const cat = extractBetween(chunk, "href='/category/", "/'");
    const type = cat ? cat.value : '';

    let date = '';
    const dm = extractBetween(html, '>Posted: ', '</li>');
    if (dm) date = dm.value.trim();

    return {
        title,
        title_jpn: titleJpn,
        type,
        language: extractNS('language')[0] ?? '',
        date,
        artists: extractNS('artist'),
        groups: extractNS('group'),
        parody: extractNS('parody'),
        characters: extractNS('character'),
        tags: extractNS('tag').map(t => ({ tag: t })),
    };
}

export const provider: Provider = {
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
    async search(rawQuery: string, page: number): Promise<SearchResults> {
        const q = rawQuery.trim();
        if (q.includes(' -') || q.startsWith('-')) {
            const key = '__imh_exclusion_warned';
            if (!(window as unknown as Record<string, boolean>)[key]) {
                (window as unknown as Record<string, boolean>)[key] = true;
                const banner = document.createElement('div');
                banner.className = 'hs-page-bar';
                banner.textContent = 'imhentai does not support excluding tags (-). Only positive terms are used.';
                banner.style.color = '#c88';
                const grid = document.getElementById('hs-grid');
                if (grid?.parentNode) grid.parentNode.insertBefore(banner, grid);
            }
        }

        const url = buildImhentaiSearchUrl(q, page);
        const html = await fetchText(url);

        const ids: number[] = [];
        const hrefs = extractAll(html, 'href="/gallery/', '"');
        let prev = -1;
        for (const h of hrefs) {
            const id = parseInt(h);
            if (!isNaN(id) && id !== prev) ids.push(id);
            prev = id;
        }

        const pageLinks = extractAll(html, "class='page-link' href='", "'");
        let totalPages = page;
        for (const href of pageLinks) {
            const m = href.match(/[?&]page=(\d+)/);
            if (m) totalPages = Math.max(totalPages, parseInt(m[1]));
        }
        if (totalPages === page && ids.length === 0) totalPages = 0;

        return { galleryIds: ids, totalResults: totalPages * PAGE_SIZE, pageSize: PAGE_SIZE };
    },

    async getGallerySummary(gid: number): Promise<GallerySummary> {
        const html = await fetchGalleryHTML(gid);
        const { thumbs, pageCount } = parseGalleryHTML(html, gid);
        return { pageCount, thumbs };
    },

    async getMeta(gid: number): Promise<GalleryMeta> {
        const html = await fetchGalleryHTML(gid);
        const { pageCount } = parseGalleryHTML(html, gid);
        return { ...extractMeta(html), pageCount };
    },

    async getReaderData(gid: number): Promise<{ images: ReaderImage[]; meta: GalleryMeta }> {
        const html = await fetchGalleryHTML(gid);
        const { images, pageCount } = parseGalleryHTML(html, gid);
        return { images, meta: { ...extractMeta(html), pageCount } };
    },

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

    thumbUrl(thumb: Thumbnail): string {
        return (thumb as ImhentaiThumb).url;
    },

    async imageUrls(images: ReaderImage[]): Promise<string[]> {
        return images.map(img => (img as ImhentaiImage).url);
    },
};
