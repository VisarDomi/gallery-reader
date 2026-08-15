import {type Thumbnail, type ReaderImage, type GalleryMeta, Handler, Provider, type SearchResults} from "../types";
import {fetchText, intersectNozomi, parseGG, parseQuery} from "./decoder";
import {detachJQueryFromSuggestionLinks, loadScript, setupDropdownHandler} from "./script";
import {DOMAIN} from "./constants";

const PAGE_SIZE = 25;
const searchCache = new Map<string, number[]>();
const galleryCache = new Map<number, string>();

interface HitomiThumb extends Thumbnail { key: string }
interface HitomiImage extends ReaderImage { key: string }

async function fetchGalleryJS(gid: number): Promise<string> {
    if (galleryCache.has(gid)) return galleryCache.get(gid)!;
    const text = await fetchText(`https://ltn.${DOMAIN}/galleries/${gid}.js`, `https://hitomi.la/reader/${gid}.html`);
    galleryCache.set(gid, text);
    return text;
}

function parseGalleryJS(text: string) {
    const json = text.split('=')[1].trim().replace(/;$/, '');
    return JSON.parse(json);
}

export const provider: Provider = {
    async init(): Promise<void> {
        const searchWrap = document.querySelector('.hs-search-input');
        if (searchWrap) {
            const suggestions = document.createElement('ul');
            suggestions.id = 'search-suggestions';
            searchWrap.appendChild(suggestions);
        }
        await loadScript('jquery.min.js');
        detachJQueryFromSuggestionLinks();
        await loadScript('common.js');
        await loadScript('searchlib.js');
        await loadScript('search.js');
        setupDropdownHandler();
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
            const index = hash ? Number(hash.slice(1)) : 0;
            return { handler: Handler.Reader, gid, index };
        }

        return null;
    },

    async search(rawQuery: string, page: number): Promise<SearchResults> {
        const cached = searchCache.get(rawQuery);
        let ids: number[];
        if (cached) {
            ids = cached;
        } else {
            const { positive, negative } = parseQuery(rawQuery);
            ids = await intersectNozomi(positive, negative);
            searchCache.set(rawQuery, ids);
        }
        const start = (page - 1) * PAGE_SIZE;
        return {
            galleryIds: ids.slice(start, start + PAGE_SIZE),
            totalResults: ids.length,
            pageSize: PAGE_SIZE,
        };
    },

    async getGalleryThumbnails(gid: number): Promise<Thumbnail[]> {
        const text = await fetchGalleryJS(gid);
        const raw = parseGalleryJS(text);
        return raw.files.map((f: { hash: string }) => ({ key: f.hash }));
    },

    async getMeta(gid: number): Promise<GalleryMeta> {
        const text = await fetchGalleryJS(gid);
        const raw = parseGalleryJS(text);
        return {
            title: raw.title || '',
            title_jpn: raw.japanese_title || '',
            type: raw.type || '',
            language: raw.language || '',
            date: raw.date || '',
            artists: (raw.artists || []).map((a: { artist: string }) => a.artist),
            groups: (raw.groups || []).map((g: { group: string }) => g.group),
            parody: (raw.parodys || []).map((p: { parody: string }) => p.parody),
            characters: (raw.characters || []).map((c: { character: string }) => c.character),
            tags: (raw.tags || []).map((t: { tag: string; female?: string; male?: string }) => ({
                tag: t.tag,
                female: t.female,
                male: t.male,
            })),
            pageCount: raw.files.length,
        };
    },

    async getReaderData(gid: number): Promise<{ images: ReaderImage[]; meta: GalleryMeta }> {
        const text = await fetchGalleryJS(gid);
        const raw = parseGalleryJS(text);
        const images: HitomiImage[] = raw.files.map((f: { hash: string; width: number; height: number }) => ({
            key: f.hash,
            width: f.width,
            height: f.height,
        }));
        const meta: GalleryMeta = {
            title: raw.title || '',
            title_jpn: raw.japanese_title || '',
            type: raw.type || '',
            language: raw.language || '',
            date: raw.date || '',
            artists: (raw.artists || []).map((a: { artist: string }) => a.artist),
            groups: (raw.groups || []).map((g: { group: string }) => g.group),
            parody: (raw.parodys || []).map((p: { parody: string }) => p.parody),
            characters: (raw.characters || []).map((c: { character: string }) => c.character),
            tags: (raw.tags || []).map((t: { tag: string; female?: string; male?: string }) => ({
                tag: t.tag,
                female: t.female,
                male: t.male,
            })),
            pageCount: raw.files.length,
        };
        return { images, meta };
    },

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

    thumbUrl(thumb: Thumbnail): string {
        const k = (thumb as HitomiThumb).key;
        return `https://tn.${DOMAIN}/webpsmalltn/${k.slice(-1)}/${k.slice(-3, -1)}/${k}.webp`;
    },

    async imageUrls(images: ReaderImage[]): Promise<string[]> {
        const gg = await parseGG();
        return images.map(img => {
            const k = (img as HitomiImage).key;
            const hashIndex = parseInt(k.slice(-1) + k.slice(-3, -1), 16);
            const offset = (gg.multiplierMap[hashIndex] ?? gg.defaultOffset) + 1;
            return `https://w${offset}.${DOMAIN}/${gg.basePath}/${hashIndex}/${k}.webp`;
        });
    },
};
