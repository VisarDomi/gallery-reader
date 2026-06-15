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

export async function parseGG(): Promise<{ multiplierMap: Record<number, number>; basePath: string; defaultOffset: number }> {
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

export interface HitomiMeta {
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

const metaCache = new Map<number, Promise<HitomiMeta>>();

export function fetchMeta(gid: number): Promise<HitomiMeta> {
    const cached = metaCache.get(gid);
    if (cached) return cached;
    const promise = _fetchMeta(gid);
    metaCache.set(gid, promise);
    return promise;
}

async function _fetchMeta(gid: number): Promise<HitomiMeta> {
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
}

export function thumbUrl(file: { hash: string }): string {
    const fileHash = file.hash;
    return `https://tn.${DOMAIN}/webpsmalltn/${fileHash.slice(-1)}/${fileHash.slice(-3, -1)}/${fileHash}.webp`;
}

export async function imageUrl(gid: number, pageIndex: number): Promise<string> {
    const meta = await fetchMeta(gid);
    const file = meta.files[pageIndex];
    if (!file) throw new Error(`Page ${pageIndex} OOB`);
    const gg = await parseGG();
    const fileHash = file.hash;
    const hashIndex = parseInt(fileHash.slice(-1) + fileHash.slice(-3, -1), 16);
    const offset = (gg.multiplierMap[hashIndex] ?? gg.defaultOffset) + 1;
    return `https://w${offset}.${DOMAIN}/${gg.basePath}/${hashIndex}/${fileHash}.webp`;
}


export function decodeNozomi(data: ArrayBuffer): number[] {
    const result: number[] = [];
    const bytes = new Uint8Array(data);
    for (let i = 0; i < bytes.length; i += 4) {
        result.push((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]);
    }
    return result;
}

/** Fetch gallery IDs for a single term from hitomi's nozomi API */
export async function searchGalleries(term: string): Promise<number[]> {
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
