import { Handler } from './types';
import type { Provider, SearchPage, GalleryMeta, GalleryFile } from './types';

const DOMAIN = 'imhentai.xxx';
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

// ── namespace parsing ─────────────────────────────────────────────────

function parseNamespace(rawQuery: string): { ns: string; value: string } | null {
    const colon = rawQuery.indexOf(':');
    if (colon === -1) return null;
    return { ns: rawQuery.slice(0, colon), value: rawQuery.slice(colon + 1) };
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
                const name = decodeURIComponent(pathname.slice(prefix.length)).replace(/\/$/, '');
                const params = new URLSearchParams(search);
                const page = parseInt(params.get('page') ?? '1');
                return { handler: Handler.Search, query: `${ns}:${name}`, page };
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
        if (rawQuery.includes(' -') || rawQuery.startsWith('-')) {
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

        const ns = parseNamespace(rawQuery);
        let url: string;
        let pageSize = 20;

        if (ns) {
            pageSize = 40;
            url = `https://${DOMAIN}/${ns.ns}/${encodeURIComponent(ns.value)}/?page=${page}`;
        } else {
            url = `https://${DOMAIN}/search/?key=${encodeURIComponent(rawQuery)}&page=${page}`;
        }

        const html = await fetchText(url);

        // Extract gallery IDs: href="/gallery/NNN"
        const ids: number[] = [];
        const hrefs = extractAll(html, 'href="/gallery/', '"');
        for (const h of hrefs) {
            const id = parseInt(h);
            if (!isNaN(id)) ids.push(id);
        }


        // Count pages from pagination links
        const pageLinks = extractAll(html, "class='page-link' href='", "'");
        let totalPages = page;
        for (const href of pageLinks) {
            const m = href.match(/[?&]page=(\d+)/);
            if (m) totalPages = Math.max(totalPages, parseInt(m[1]));
        }
        if (totalPages === page && ids.length === 0) totalPages = 0;

        return { ids, totalResults: totalPages * pageSize, pageSize };
    },

    goToPage(rawQuery: string, page: number): void {
        window.location.href = this.searchUrl(rawQuery, page);
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
                const m = extractBetween(chunk, 'href="/' + ns + '/', '"', pos);
                if (!m) break;
                const tagEnd = chunk.indexOf('</a>', m.nextIndex);
                if (tagEnd === -1) break;
                let tag = chunk.slice(m.nextIndex, tagEnd).replace(/<[^>]*>/g, '').trim();
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
        const cat = extractBetween(chunk, 'href="/category/', '"');
        const type = cat ? cat.value : '';

        // Posted date
        let date = '';
        const postedIdx = html.indexOf('>Posted');
        if (postedIdx !== -1) {
            const dm = extractBetween(html, '<', '<', postedIdx + 20);
            if (dm) date = dm.value.replace(/^[>\s]+/, '').trim();
        }

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
        const ns = parseNamespace(rawQuery);
        let base: string;
        if (ns) {
            base = `https://${DOMAIN}/${ns.ns}/${encodeURIComponent(ns.value)}/`;
        } else {
            base = `https://${DOMAIN}/search/?key=${encodeURIComponent(rawQuery)}`;
        }
        if (page !== undefined) base += (ns ? '?' : '&') + 'page=' + page;
        return base;
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
