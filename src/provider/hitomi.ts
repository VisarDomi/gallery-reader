import { Handler } from './types';
import type { Provider, SearchPage, GalleryMeta } from './types';

// ── query parser (hitomi-specific) ────────────────────────────────────

function parseQuery(raw: string): { positive: string[]; negative: string[] } {
    const terms = raw.split(/\s+/).filter(Boolean);
    const positive: string[] = [];
    const negative: string[] = [];
    for (const term of terms) {
        if (term.startsWith('-')) {
            const value = term.slice(1);
            if (value) negative.push(value);
        } else {
            positive.push(term);
        }
    }
    if (positive.length === 0) {
        positive.push('language:japanese');
    }
    return { positive, negative };
}

// ── infrastructure ────────────────────────────────────────────────────

const DOMAIN = 'gold-usergeneratedcontent.net';
const GG_URL = `https://ltn.${DOMAIN}/gg.js`;
const METADATA_URL = (gid: number) => `https://ltn.${DOMAIN}/galleries/${gid}.js`;
const PAGE_SIZE = 25;
const searchCache = new Map<string, number[]>();

let ggCache: { multiplierMap: Record<number, number>; basePath: string; defaultOffset: number } | null = null;

async function fetchText(url: string, referer?: string): Promise<string> {
    const headers: Record<string, string> = {};
    if (referer) headers['Referer'] = referer;
    const resp = await fetch(url, { headers });
    if (!resp.ok) throw Error(`HTTP ${resp.status}`);
    return resp.text();
}

async function parseGG(): Promise<{ multiplierMap: Record<number, number>; basePath: string; defaultOffset: number }> {
    if (ggCache) return ggCache;
    const text = await fetchText(GG_URL);
    const multiplierMap: Record<number, number> = {};
    let keys: number[] = [];
    let match: RegExpExecArray | null;
    const caseRegex = /case\s+(\d+):(?:\s*o\s*=\s*(\d+))?/g;
    while ((match = caseRegex.exec(text)) !== null) {
        keys.push(parseInt(match[1]));
        if (match[2]) {
            const val = parseInt(match[2]);
            for (const k of keys) multiplierMap[k] = val;
            keys = [];
        }
    }
    const ifRegex = /if\s+\(g\s*===?\s*(\d+)\)[\s{]*o\s*=\s*(\d+)/g;
    while ((match = ifRegex.exec(text)) !== null) multiplierMap[parseInt(match[1])] = parseInt(match[2]);
    const defaultOffsetMatch = /(?:var\s|default:)\s*o\s*=\s*(\d+)/.exec(text);
    const basePathMatch = /b:\s*[']([^']+)[']/.exec(text);
    ggCache = {
        multiplierMap,
        basePath: basePathMatch ? basePathMatch[1].replace(/\/$/, '') : '',
        defaultOffset: defaultOffsetMatch ? parseInt(defaultOffsetMatch[1]) : 0,
    };
    return ggCache;
}

function decodeNozomi(data: ArrayBuffer): number[] {
    const result: number[] = [];
    const bytes = new Uint8Array(data);
    for (let i = 0; i < bytes.length; i += 4) {
        result.push((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]);
    }
    return result;
}

function loadScript(filename: string): Promise<void> {
    const { promise, resolve } = Promise.withResolvers<void>();
    const script = document.createElement('script');
    script.src = `https://ltn.${DOMAIN}/${filename}`;
    script.onload = () => resolve();
    document.head.appendChild(script);
    return promise;
}

// Intercept jQuery .on() after jQuery loads so search.js never binds its
// broken click handler to .search-suggestion_string elements.
function detachJQueryFromSuggestionLinks(): void {
    const jq = (window as unknown as { jQuery?: { fn: { on: (...args: unknown[]) => unknown } } }).jQuery;
    if (!jq) return;
    const origOn = jq.fn.on;
    jq.fn.on = function (this: unknown, types: string, selector: unknown, handler: unknown) {
        if (typeof selector === 'function') { handler = selector; }
        if (types === 'click' && typeof handler === 'function' && (this as { is: (s: string) => boolean }).is('.search-suggestion_string')) {
            return this;
        }
        return origOn.apply(this, arguments as unknown as Parameters<typeof origOn>);
    } as typeof origOn;
}

function setupDropdownHandler(): void {
    const sugg = document.getElementById('search-suggestions') as HTMLElement;
    sugg.addEventListener('click', (e) => {
        const a = (e.target as Element).closest<HTMLAnchorElement>('a.search-suggestion_string');
        if (!a) return;
        e.preventDefault();
        e.stopPropagation();

        const resultSpan = a.querySelector('.search-result');
        const nsSpan = a.querySelector('.search-ns');
        if (!resultSpan) return;

        const name = resultSpan.textContent?.trim() ?? '';
        const nsText = nsSpan?.textContent?.trim() ?? '';
        const ns = nsText.replace(/^\(|\)$/g, '').trim();

        const underscored = name.replace(/\s/g, '_');
        const term = ns ? `${ns}:${underscored}` : underscored;

        const input = document.getElementById('query-input') as HTMLInputElement;
        const val = input.value;
        const lastSpace = val.lastIndexOf(' ');
        const prefix = lastSpace >= 0 ? val.substring(0, lastSpace + 1) : '';
        const lastWord = val.substring(lastSpace + 1);
        const dash = lastWord.startsWith('-') ? '-' : '';
        input.value = prefix + dash + term + ' ';
        input.focus();

        const origClear = (window as unknown as { clear_page?: () => void }).clear_page;
        if (origClear) origClear();
    }, { capture: true });
}

function startAdBlocker(): void {
    new MutationObserver(mutations => {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (!(node instanceof Element)) continue;
                const tag = node.tagName;
                const cls = (node as Element).className;
                if (tag === 'SCRIPT' || tag === 'IFRAME' || tag === 'INS') {
                    node.remove();
                } else if (tag === 'DIV' && cls.length > 0 && !cls.startsWith('hs-')) {
                    node.remove();
                }
            }
        }
    }).observe(document.body, { childList: true });
}

// ── search (nozomi) ───────────────────────────────────────────────────

async function searchGalleries(term: string): Promise<number[]> {
    const [ns, ...tagParts] = term.split(':');
    const tag = tagParts.join(':');
    let urlNs: string, urlTag: string, language = 'all';
    if (ns === 'female' || ns === 'male') {
        urlNs = 'tag/';
        urlTag = term.replace(/_/g, ' ');
    } else if (ns === 'language') {
        urlNs = '';
        language = tag;
        urlTag = 'index';
    } else if (tag) {
        urlNs = ns + '/';
        urlTag = tag.replace(/_/g, ' ');
    } else {
        urlNs = 'tag/';
        urlTag = ns.replace(/_/g, ' ');
    }
    const url = `https://ltn.${DOMAIN}/n/${urlNs}${urlTag}-${language}.nozomi`;
    const resp = await fetch(url, {
        headers: { 'Origin': 'https://hitomi.la', 'Referer': 'https://hitomi.la/' },
    });
    return decodeNozomi(await resp.arrayBuffer());
}

async function intersectNozomi(positive: string[], negative: string[]): Promise<number[]> {
    let idSet: Set<number> | null = null;
    for (const tag of positive) {
        const ids = await searchGalleries(tag);
        if (idSet === null) idSet = new Set(ids);
        else idSet = new Set(ids.filter(id => idSet!.has(id)));
    }
    for (const tag of negative) {
        const ids = new Set(await searchGalleries(tag));
        if (idSet) idSet = new Set([...idSet].filter(id => !ids.has(id)));
    }
    return idSet ? [...idSet] : [];
}

// ── provider ──────────────────────────────────────────────────────────

export const provider: Provider = {
    name: 'hitomi',

    async init(): Promise<void> {
        // Build the suggestions dropdown (hitomi-specific)
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
        startAdBlocker();
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
        // Hash-based — triggers hashchange, re-enters via pagereveal / init
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

    thumbUrl(file: { hash: string }): string {
        const fileHash = file.hash;
        return `https://tn.${DOMAIN}/webpsmalltn/${fileHash.slice(-1)}/${fileHash.slice(-3, -1)}/${fileHash}.webp`;
    },

    async imageUrl(gid: number, pageIndex: number): Promise<string> {
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
        const text = await fetchText(METADATA_URL(gid), `https://hitomi.la/reader/${gid}.html`);
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
