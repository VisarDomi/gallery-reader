import { Handler } from './types';
import type { Provider } from './types';

const DOMAIN = 'gold-usergeneratedcontent.net';
const GG_URL = `https://ltn.${DOMAIN}/gg.js`;
const METADATA_URL = (gid: number) => `https://ltn.${DOMAIN}/galleries/${gid}.js`;
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
    ggCache = {multiplierMap, basePath: basePathMatch ? basePathMatch[1].replace(/\/$/, '') : '', defaultOffset: defaultOffsetMatch ? parseInt(defaultOffsetMatch[1]) : 0};
    return ggCache;
}

interface HitomiMeta {
    title: string;
    title_jpn: string;
    type: string;
    language: string;
    language_localname: string;
    date: string;
    datepublished: string;
    artists: string[];
    groups: string[];
    parody: string[];
    characters: string[];
    tags: { tag: string; female?: string; male?: string }[];
    files: { hash: string; name: string; width: number; height: number }[];
    gallery_id: number;
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
    return new Promise(resolve => {
        const script = document.createElement('script');
        script.src = `https://ltn.${DOMAIN}/${filename}`;
        script.onload = () => resolve();
        document.head.appendChild(script);
    });
}

// Intercept jQuery .on() after jQuery loads so search.js never binds its
// broken click handler to .search-suggestion_string elements.
function detachJQueryFromSuggestionLinks(): void {
    const jq = (window as any).jQuery;
    if (!jq) return;
    const origOn = jq.fn.on;
    jq.fn.on = function (this: any, types: string, selector: any, handler: any) {
        if (typeof selector === 'function') { handler = selector; }
        if (types === 'click' && typeof handler === 'function' && this.is('.search-suggestion_string')) {
            return this;
        }
        return origOn.apply(this, arguments as any);
    } as any;
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

        const origClear = (window as any).clear_page as Function | undefined;
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

export const provider: Provider = {
    name: 'hitomi',
    itemsPerPage: 25,

    async init(): Promise<void> {
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
            return { handler: Handler.Reader, gid, hash };
        }

        return null;
    },

    readerUrl(gid: number, index?: number): string {
        let url = `https://hitomi.la/reader/${gid}.html`;
        if (index !== undefined) url += '#' + index;
        return url;
    },

    searchUrl(query: string): string {
        return 'https://hitomi.la/search.html?' + encodeURIComponent(query);
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

    async fetchMeta(gid: number): Promise<HitomiMeta> {
        const text = await fetchText(METADATA_URL(gid), `https://hitomi.la/reader/${gid}.html`);
        const raw = JSON.parse(text.split('=')[1].trim().replace(/;$/, ''));
        return {
            title: raw.title || '',
            title_jpn: raw.japanese_title || '',
            type: raw.type || '',
            language: raw.language || '',
            language_localname: raw.language_localname || '',
            date: raw.date || '',
            datepublished: raw.datepublished || '',
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
            gallery_id: raw.id || gid,
        };
    },

    /** Fetch gallery IDs for a single term from hitomi's nozomi API */
    async searchGalleries(term: string): Promise<number[]> {
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
    },
};
