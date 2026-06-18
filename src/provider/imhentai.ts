import { Handler } from './types';
import type { Provider, SearchPage, GalleryMeta, GalleryFile } from './types';

const DOMAIN = 'imhentai.xxx';
const PAGE_SIZE = 20;
// ── fetch ─────────────────────────────────────────────────────────────

async function fetchText(url: string): Promise<string> {
    const resp = await fetch(url, { credentials: 'include' });
    if (!resp.ok) throw Error(`HTTP ${resp.status}`);
    return resp.text();
}

// ── HTML scraping ─────────────────────────────────────────────────────

function extractBetween(html: string, start: string, end: string, fromIndex = 0): { value: string; nextIndex: number } | null {
    const s = html.indexOf(start, fromIndex);
    if (s === -1) return null;
    const e = html.indexOf(end, s + start.length);
    if (e === -1) return null;
    return { value: html.slice(s + start.length, e), nextIndex: e + end.length };
}

function extractAll(html: string, start: string, end: string): string[] {
    const results: string[] = [];
    let idx = 0;
    while (true) {
        const m = extractBetween(html, start, end, idx);
        if (!m) break;
        results.push(m.value);
        idx = m.nextIndex;
    }
    return results;
}

// ── query parsing ──────────────────────────────────────────────────────

const LANG_PARAM: Record<string, string> = { japanese:'jp', english:'en', spanish:'es', french:'fr', korean:'kr', german:'de', russian:'ru' };

interface ParsedQuery {
    language: string | null;
    namespaces: { ns: string; value: string }[];
    keywords: string[];
}

function parseImhentaiQuery(raw: string): ParsedQuery {
    const terms = raw.split(',').map(t => t.trim()).filter(Boolean);
    const namespaces: { ns: string; value: string }[] = [];
    const keywords: string[] = [];
    let language: string | null = null;

    for (const term of terms) {
        const colon = term.indexOf(':');
        if (colon === -1) {
            keywords.push(term);
            continue;
        }
        const ns = term.slice(0, colon);
        const value = term.slice(colon + 1);
        if (ns === 'language') {
            language = value;
        } else {
            namespaces.push({ ns, value });
        }
    }

    return { language, namespaces, keywords };
}

function buildImhentaiSearchUrl(query: string, page?: number): string {
    const { language, namespaces, keywords } = parseImhentaiQuery(query.trim());

    // path-based: single namespace or language-only
    if (!language && keywords.length === 0 && namespaces.length === 1) {
        let url = `https://${DOMAIN}/${namespaces[0].ns}/${encodeURIComponent(namespaces[0].value.replace(/\s+/g, '-'))}/`;
        if (page !== undefined) url += '?page=' + page;
        return url;
    }
    if (language && namespaces.length === 0 && keywords.length === 0) {
        let url = `https://${DOMAIN}/language/${encodeURIComponent(language.replace(/\s+/g, '-'))}/`;
        if (page !== undefined) url += '?page=' + page;
        return url;
    }

    // search endpoint
    const params = new URLSearchParams();
    params.set('lt', '1'); params.set('pp', '0');
    params.set('m', '1'); params.set('d', '1'); params.set('w', '1');
    params.set('i', '1'); params.set('a', '1'); params.set('g', '1');
    params.set('apply', 'Search');
    params.set('dl', '0'); params.set('tr', '0');

    // language params — all enabled for keyword search, or specific if set
    if (language) {
        const langCode = LANG_PARAM[language] ?? 'jp';
        for (const code of Object.values(LANG_PARAM)) {
            params.set(code, code === langCode ? '1' : '0');
        }
    } else {
        for (const code of Object.values(LANG_PARAM)) {
            params.set(code, '1');
        }
    }

    params.set('key', keywords.join(','));

    let url = `https://${DOMAIN}/search/?${params.toString()}`;
    if (page !== undefined) url += '&page=' + page;
    return url;
}

// ── provider ──────────────────────────────────────────────────────────

export const provider: Provider = {
    name: 'imhentai',

    async init(): Promise<void> {
        // No autocomplete to wire up
    },

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
    async search(rawQuery: string, page: number): Promise<SearchPage> {
        // exclusion warning
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

        // Extract gallery IDs: href="/gallery/NNN"
        const ids: number[] = [];
        const hrefs = extractAll(html, 'href="/gallery/', '"');
        let prev = -1;
        for (const h of hrefs) {
            const id = parseInt(h);
            if (!isNaN(id) && id !== prev) ids.push(id);
            prev = id;
        }

        // Count pages from pagination links
        const pageLinks = extractAll(html, "class='page-link' href='", "'");
        let totalPages = page;
        for (const href of pageLinks) {
            const m = href.match(/[?&]page=(\d+)/);
            if (m) totalPages = Math.max(totalPages, parseInt(m[1]));
        }
        if (totalPages === page && ids.length === 0) totalPages = 0;

        return { ids, totalResults: totalPages * PAGE_SIZE, pageSize: PAGE_SIZE };
    },
    goToPage(rawQuery: string, page: number): void {
        history.replaceState(null, '', buildImhentaiSearchUrl(rawQuery, page));
    },

    async fetchMeta(gid: number): Promise<GalleryMeta> {
        const html = await fetchText(`https://${DOMAIN}/gallery/${gid}/`);

        // Title
        const h1 = extractBetween(html, '<h1>', '</h1>');
        const title = h1 ? h1.value.replace(/<[^>]*>/g, '').trim() : '';

        // Japanese title
        const sub = extractBetween(html, 'class="subtitle">', '<');
        const titleJpn = sub ? sub.value.trim() : '';

        // Metadata section
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

        const artists = extractNS('artist');
        const groups = extractNS('group');
        const parody = extractNS('parody');
        const characters = extractNS('character');
        const tags = extractNS('tag');
        const languages = extractNS('language');

        // Category
        const cat = extractBetween(chunk, "href='/category/", "/'");
        const type = cat ? cat.value : '';

        // Posted date
        let date = '';
        const dm = extractBetween(html, '>Posted: ', '</li>');
        if (dm) date = dm.value.trim();

        // ── Images ──────────────────────────────────────────────────
        const srcM = extractBetween(html, 'data-src="', '"');
        const base = srcM ? srcM.value.substring(0, srcM.value.lastIndexOf('/')) + '/' : '';
        const exts: Record<string, string> = { j: 'jpg', p: 'png', g: 'gif', w: 'webp', a: 'avif' };

        const files: GalleryFile[] = [];
        // Try inline JSON
        const jsonM = extractBetween(html, "$.parseJSON('", "'");
        if (jsonM) {
            try {
                const data = JSON.parse(jsonM.value) as Record<string, string>;
                const keys = Object.keys(data).sort((a, b) => parseInt(a) - parseInt(b));
                let idx = 1;
                for (const key of keys) {
                    const parts = data[key].split(',');
                    const ext = exts[parts[0]] ?? 'jpg';
                    const url = `${base}${idx}.${ext}`;
                    files.push({
                        name: `${idx}.${ext}`,
                        hash: url,           // full-size URL — unique per file
                        width: parseInt(parts[1]) || 0,
                        height: parseInt(parts[2]) || 0,
                    });
                    idx++;
                }
            } catch {
                // JSON parse failed — fall through
            }
        }

        // Fallback: load_pages hidden input
        if (files.length === 0) {
            const lp = extractBetween(html, 'id="load_pages" value="', '"');
            const count = lp ? parseInt(lp.value) : 0;
            const viewCount = extractAll(html, 'href="/view/' + gid + '/', '"').length;
            const imageCount = count || viewCount;

            for (let i = 1; i <= imageCount; i++) {
                const url = `${base}${i}.jpg`;
                files.push({
                    name: `${i}.jpg`,
                    hash: url,               // full-size URL
                    width: 0,
                    height: 0,
                });
            }
        }

        return {
            title,
            title_jpn: titleJpn,
            type,
            language: languages[0] ?? '',
            date,
            artists,
            groups,
            parody,
            characters,
            tags: tags.map(t => ({ tag: t })),
            files,
        };
    },

    readerUrl(gid: number, index?: number): string {
        if (index !== undefined) return `https://${DOMAIN}/view/${gid}/${index + 1}/`;
        return `https://${DOMAIN}/view/${gid}/1/`;
    },

    searchUrl(rawQuery: string, page?: number): string {
        return buildImhentaiSearchUrl(rawQuery, page);
    },

    thumbUrl(file: GalleryFile): string {
        return file.hash;
    },

    async imageUrl(gid: number, pageIndex: number): Promise<string> {
        const meta = await this.fetchMeta(gid);
        const file = meta.files[pageIndex];
        if (!file) throw new Error(`Page ${pageIndex} OOB`);
        return file.hash;
    },
};
