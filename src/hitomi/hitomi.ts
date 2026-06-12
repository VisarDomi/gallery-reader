const DOMAIN = 'gold-usergeneratedcontent.net';
const GG_URL = `https://ltn.${DOMAIN}/gg.js`;
const METADATA_URL = (gid: number) => `https://ltn.${DOMAIN}/galleries/${gid}.js`;
let ggCache: { m: Record<number, number>; b: string; d: number } | null = null;

async function fetchText(url: string, referer?: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.setRequestHeader('Origin', 'https://hitomi.la');
        if (referer) xhr.setRequestHeader('Referer', referer);
        xhr.onload = () => xhr.status === 200 ? resolve(xhr.responseText) : reject(Error(`HTTP ${xhr.status}`));
        xhr.onerror = () => reject(Error('Network error'));
        xhr.send();
    });
}

export async function parseGG(): Promise<{ m: Record<number, number>; b: string; d: number }> {
    if (ggCache) return ggCache;
    const text = await fetchText(GG_URL);
    const m: Record<number, number> = {};
    let keys: number[] = [];
    let match: RegExpExecArray | null;
    const re1 = /case\s+(\d+):(?:\s*o\s*=\s*(\d+))?/g;
    while ((match = re1.exec(text)) !== null) {
        keys.push(parseInt(match[1]));
        if (match[2]) {
            const v = parseInt(match[2]);
            for (const k of keys) m[k] = v;
            keys = [];
        }
    }
    const re2 = /if\s+\(g\s*===?\s*(\d+)\)[\s{]*o\s*=\s*(\d+)/g;
    while ((match = re2.exec(text)) !== null) m[parseInt(match[1])] = parseInt(match[2]);
    const d = /(?:var\s|default:)\s*o\s*=\s*(\d+)/.exec(text);
    const bArr = /b:\s*[']([^']+)[']/.exec(text);
    ggCache = {m, b: bArr ? bArr[1].replace(/\/$/, '') : '', d: d ? parseInt(d[1]) : 0};
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

export async function fetchMeta(gid: number): Promise<HitomiMeta> {
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
    const h = file.hash;
    return `https://tn.${DOMAIN}/webpsmalltn/${h.slice(-1)}/${h.slice(-3, -1)}/${h}.webp`;
}

export async function imageUrl(gid: number, pageIndex: number): Promise<string> {
    const meta = await fetchMeta(gid);
    const file = meta.files[pageIndex];
    if (!file) throw new Error(`Page ${pageIndex} OOB`);
    const gg = await parseGG();
    const h = file.hash;
    const inum = parseInt(h.slice(-1) + h.slice(-3, -1), 16);
    const offset = (gg.m[inum] ?? gg.d) + 1;
    return `https://w${offset}.${DOMAIN}/${gg.b}/${inum}/${h}.webp`;
}
