import {type GalleryMeta, Handler, Provider, type SearchPage} from "../types";
import {fetchText, intersectNozomi, parseGG, parseQuery} from "./decoder";
import {detachJQueryFromSuggestionLinks, loadScript, setupDropdownHandler} from "./script";
import {DOMAIN} from "./constants";

const PAGE_SIZE = 25;
const searchCache = new Map<string, number[]>();
export const provider: Provider = {
    name: 'hitomi',

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

    async search(rawQuery: string, page: number): Promise<SearchPage> {
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
            ids: ids.slice(start, start + PAGE_SIZE),
            totalResults: ids.length,
            pageSize: PAGE_SIZE,
        };
    },

    goToPage(_query: string, page: number): void {
        window.location.hash = '#' + page;
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
        let q = ns + ':' + value.replace(/ /g, '_');
        if (language && ns !== 'language') q += ' language:' + language;
        return this.searchUrl(q);
    },

    thumbUrl(file: { hash: string }): string {
        const fileHash = file.hash;
        return `https://tn.${DOMAIN}/webpsmalltn/${fileHash.slice(-1)}/${fileHash.slice(-3, -1)}/${fileHash}.webp`;
    },

    async imageUrl(gid: number, pageIndex: number): Promise<string> {
        // why is this written this way? anyway, like it's said in reader, this function should return a mapping of promises.
        const meta = await this.fetchMeta(gid);
        const file = meta.files[pageIndex];
        if (!file) throw new Error(`Page ${pageIndex} OOB`);
        const gg = await parseGG();
        const fileHash = file.hash;
        const hashIndex = parseInt(fileHash.slice(-1) + fileHash.slice(-3, -1), 16);
        const offset = (gg.multiplierMap[hashIndex] ?? gg.defaultOffset) + 1;
        return `https://w${offset}.${DOMAIN}/${gg.basePath}/${hashIndex}/${fileHash}.webp`;
    },
    async fetchMeta(gid: number): Promise<GalleryMeta> {
        const text = await fetchText(`https://ltn.${DOMAIN}/galleries/${gid}.js`, `https://hitomi.la/reader/${gid}.html`);
        const raw = JSON.parse(text.split('=')[1].trim().replace(/;$/, ''));
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
            files: raw.files.map((f: { hash: string; name: string; width: number; height: number }) => f),
        };
    },
};
