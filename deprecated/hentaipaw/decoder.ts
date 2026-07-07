import { DOMAIN, CDN, NAMESPACES, type Namespace } from "./constants";
import type { Thumbnail, ReaderImage, GalleryMeta } from "../types";

// ── fetch helpers ─────────────────────────────────────────────────────

export async function fetchText(url: string): Promise<string> {
    const resp = await fetch(url);
    if (!resp.ok) throw Error(`HTTP ${resp.status} from ${url}`);
    return resp.text();
}

export async function fetchBytes(url: string, bytes: number): Promise<ArrayBuffer> {
    const resp = await fetch(url, { headers: { Range: `bytes=0-${bytes - 1}` } });
    if (!resp.ok) throw Error(`HTTP ${resp.status} from ${url}`);
    return resp.arrayBuffer();
}

// ── article page cache ────────────────────────────────────────────────

const articleCache = new Map<number, string>();

export async function fetchArticleHTML(articleId: number): Promise<string> {
    if (articleCache.has(articleId)) return articleCache.get(articleId)!;
    const html = await fetchText(`https://${DOMAIN}/articles/${articleId}`);
    articleCache.set(articleId, html);
    return html;
}

// ── viewer hash cache ─────────────────────────────────────────────────

const viewerCache = new Map<number, Record<number, string>>();

export async function fetchViewerHashes(articleId: number): Promise<Record<number, string>> {
    if (viewerCache.has(articleId)) return viewerCache.get(articleId)!;
    const html = await fetchText(`https://${DOMAIN}/viewer?articleId=${articleId}&page=1`);
    const pages: Record<number, string> = {};
    const re = new RegExp(`${CDN.replace(/\./g, '\\.')}/${articleId}/([a-f0-9]{40})/(\\d+)\\.webp`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        pages[parseInt(m[2])] = m[1];
    }
    viewerCache.set(articleId, pages);
    return pages;
}

// ── article page parsing ──────────────────────────────────────────────

export interface HentaipawThumb extends Thumbnail {
    articleId: number;
    pageNum: number;
    ext: string;
}

export interface HentaipawImage extends ReaderImage {
    articleId: number;
    pageNum: number;
}

export function parseArticleThumbs(html: string, articleId: number): HentaipawThumb[] {
    const thumbs: HentaipawThumb[] = [];
    const re = new RegExp(`${CDN.replace(/\./g, '\\.')}/${articleId}/thumbnails/(\\d+)\\.(\\w+)`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        const pageNum = parseInt(m[1]);
        if (pageNum < 1) continue;
        thumbs.push({ articleId, pageNum, ext: m[2] });
    }
    return thumbs;
}

export function parseArticleMeta(html: string, pageCount: number): GalleryMeta {
    const title = extractArticleTitle(html);

    const lang = extractBetween(html, '### Language:', '</p>')?.trim() ?? '';
    const type = extractBetween(html, '### Category:', '</p>')?.trim() ?? '';

    let date = '';
    const dateM = extractBetween(html, '### Posted:', '</p>');
    if (dateM) date = dateM.trim();

    return {
        title,
        title_jpn: '',
        type,
        language: lang,
        date,
        artists: extractLinks(html, '/artists/'),
        groups: extractLinks(html, '/groups/'),
        parody: extractLinks(html, '/parodies/'),
        characters: extractLinks(html, '/characters/'),
        tags: extractLinks(html, '/tags/').map(t => ({ tag: t })),
        pageCount,
    };
}

function extractArticleTitle(html: string): string {
    const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html);
    if (!h1) return '';
    return decodeEntities(h1[1].replace(/<[^>]*>/g, '').trim());
}

function extractBetween(html: string, start: string, end: string): string | null {
    const s = html.indexOf(start);
    if (s === -1) return null;
    const e = html.indexOf(end, s + start.length);
    if (e === -1) return null;
    return html.slice(s + start.length, e).replace(/<[^>]*>/g, '').trim();
}

function extractLinks(html: string, pathPrefix: string): string[] {
    const results: string[] = [];
    const re = new RegExp(`href="${pathPrefix.replace(/\//g, '\\/')}(\\d+)"[^>]*>([^<]+)<`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        const name = m[2].trim();
        if (name && !results.includes(name)) results.push(name);
    }
    return results;
}

function decodeEntities(s: string): string {
    return s
        .replace(/&#x27;/g, "'")
        .replace(/&#x2F;/g, '/')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
        .trim();
}

// ── WebP VP8 dimension parsing ────────────────────────────────────────

export async function resolveWebpDimensions(url: string): Promise<{ width: number; height: number }> {
    const buf = await fetchBytes(url, 2048);
    const bytes = new Uint8Array(buf);

    if (bytes[0] !== 0x52 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x46) {
        return { width: 0, height: 0 };
    }

    // VP8 (lossy)
    if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x20) {
        return {
            width: (bytes[26] | (bytes[27] << 8)) & 0x3FFF,
            height: (bytes[28] | (bytes[29] << 8)) & 0x3FFF,
        };
    }

    // VP8L (lossless)
    if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x4c) {
        const b0 = bytes[21], b1 = bytes[22], b2 = bytes[23], b3 = bytes[24];
        return {
            width: (b0 | (b1 << 8) | ((b2 & 0x3F) << 16)) + 1,
            height: (((b2 & 0xC0) >> 6) | (b3 << 2) | ((bytes[25] || 0) << 10) | ((bytes[26] || 0) << 18)) + 1,
        };
    }

    // VP8X (extended)
    if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x58) {
        return {
            width: (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1,
            height: (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1,
        };
    }

    return { width: 0, height: 0 };
}

// ── name ↔ id resolution ─────────────────────────────────────────────

const DB_NAME = 'storage_names';
const STORE_NAME = 'names';
let db: IDBDatabase | null = null;

const nameToId = new Map<string, number>();
const idToName = new Map<string, string>();

function cacheKey(ns: string, key: string): string {
    return `${ns}:${key}`;
}

export async function initNameCache(): Promise<void> {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => {
        db = req.result;
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (cursor) {
                const row = cursor.value as { ns: string; name: string; id: number };
                nameToId.set(cacheKey(row.ns, row.name), row.id);
                idToName.set(cacheKey(row.ns, String(row.id)), row.name);
                cursor.continue();
            } else {
                resolve();
            }
        };
        cursorReq.onerror = () => reject(cursorReq.error);
    };
    req.onerror = () => reject(req.error);
    return promise;
}

function storeCacheEntry(ns: string, name: string, id: number): void {
    if (!db) return;
    try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put({ ns, name, id });
    } catch { /* db might be closed */ }
}

export async function resolveName(ns: Namespace, rawName: string): Promise<number> {
    const name = rawName.replace(/_/g, ' ').toLowerCase();
    const key = cacheKey(ns, name);
    const cached = nameToId.get(key);
    if (cached !== undefined) return cached;
    const id = await binarySearchEntity(ns, name);
    nameToId.set(key, id);
    idToName.set(cacheKey(ns, String(id)), name);
    storeCacheEntry(ns, name, id);
    return id;
}

export async function resolveId(ns: Namespace, id: number): Promise<string> {
    const key = cacheKey(ns, String(id));
    const cached = idToName.get(key);
    if (cached !== undefined) return cached;
    const html = await fetchText(`https://${DOMAIN}/${ns}s/${id}`);
    const name = extractHeadingName(html);
    if (name) {
        nameToId.set(cacheKey(ns, name.toLowerCase()), id);
        idToName.set(key, name);
        storeCacheEntry(ns, name.toLowerCase(), id);
    }
    return name ?? '';
}

function extractHeadingName(html: string): string | null {
    const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html);
    if (!h1) return null;
    let name = decodeEntities(h1[1].replace(/<[^>]*>/g, '').trim());
    name = name.replace(/\s+hentai manga\s+(&\s+)?porn comics$/i, '').trim();
    if ((name.startsWith("'") && name.endsWith("'")) || (name.startsWith('"') && name.endsWith('"'))) {
        name = name.slice(1, -1);
    }
    return name || null;
}

async function binarySearchEntity(ns: Namespace, target: string): Promise<number> {
    let lo = 1;
    let hi = 1;
    while (true) {
        const entries = await fetchListingPage(ns, hi);
        if (entries.length === 0) break;
        const last = entries[entries.length - 1];
        if (last.name.toLowerCase() >= target) break;
        lo = hi + 1;
        hi *= 2;
    }
    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const entries = await fetchListingPage(ns, mid);
        if (entries.length === 0) { hi = mid - 1; continue; }
        const first = entries[0].name.toLowerCase();
        const last = entries[entries.length - 1].name.toLowerCase();
        if (target < first) {
            hi = mid - 1;
        } else if (target > last) {
            lo = mid + 1;
        } else {
            for (const e of entries) {
                if (e.name.toLowerCase() === target) return e.id;
            }
            return entries[0].id;
        }
    }
    throw Error(`Entity not found: ${ns}:${target}`);
}

interface ListingEntry { name: string; id: number }

async function fetchListingPage(ns: string, page: number): Promise<ListingEntry[]> {
    const html = await fetchText(`https://${DOMAIN}/${ns}s?page=${page}`);
    const re = new RegExp(`href="/${ns}s/(\\d+)"[^>]*title="([^"]*)"`, 'g');
    const entries: ListingEntry[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        entries.push({ id: parseInt(m[1]), name: m[2] });
    }
    return entries;
}

// ── entity detail page parsing (for search) ───────────────────────────

export interface SearchListingEntry {
    articleId: number;
    title: string;
    language: string;
    ext: string;
}

export function parseEntityListings(html: string): SearchListingEntry[] {
    const results: SearchListingEntry[] = [];
    const articleRe = /<a[^>]*href="\/articles\/(\d+)"[^>]*>([\s\S]*?)<\/a>/g;
    let aMatch: RegExpExecArray | null;
    while ((aMatch = articleRe.exec(html)) !== null) {
        const articleId = parseInt(aMatch[1]);
        const inner = aMatch[2];
        const imgMatch = /<img[^>]*alt="([^"]*)"[^>]*>/i.exec(inner);
        if (!imgMatch) continue;
        const altText = imgMatch[1];
        const srcMatch = /\/thumbnails\/\w+\.(\w+)/.exec(inner);
        const ext = srcMatch ? srcMatch[1] : 'webp';

        const commaIdx = altText.indexOf(', ');
        let title = altText;
        let language = '';
        if (commaIdx !== -1) {
            title = altText.slice(0, commaIdx);
            const afterComma = altText.slice(commaIdx + 2);
            const langMatch = /^(\S+)/.exec(afterComma);
            if (langMatch) language = langMatch[1];
        }
        results.push({ articleId, title, language, ext });
    }
    return results;
}

// ── query parsing ─────────────────────────────────────────────────────

export interface ParsedQuery {
    namespace: Namespace | null;
    value: string;
    language: string | null;
}

export function parseQuery(raw: string): ParsedQuery {
    const terms = raw.split(/\s+/).filter(Boolean);
    let namespace: Namespace | null = null;
    let value = '';
    let language: string | null = null;

    for (const term of terms) {
        const colonIdx = term.indexOf(':');
        if (colonIdx === -1) continue;
        const key = term.slice(0, colonIdx);
        const val = term.slice(colonIdx + 1);

        if (key === 'language') {
            language = val;
        } else if (NAMESPACES.includes(key as Namespace)) {
            namespace = key as Namespace;
            value = val;
        }
    }
    return { namespace, value, language };
}
