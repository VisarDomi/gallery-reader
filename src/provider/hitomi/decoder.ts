import {DOMAIN} from "./constants";

export function parseQuery(raw: string): { positive: string[]; negative: string[] } {
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
    return {positive, negative};
}


export async function fetchText(url: string, referer?: string): Promise<string> {
    const headers: Record<string, string> = {};
    if (referer) headers['Referer'] = referer;
    const resp = await fetch(url, { headers });
    if (!resp.ok) throw Error(`HTTP ${resp.status}`);
    return resp.text();
}

let ggCache: { multiplierMap: Record<number, number>; basePath: string; defaultOffset: number } | null = null;
const GG_URL = `https://ltn.${DOMAIN}/gg.js`;
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
    ggCache = {
        multiplierMap,
        basePath: basePathMatch ? basePathMatch[1].replace(/\/$/, '') : '',
        defaultOffset: defaultOffsetMatch ? parseInt(defaultOffsetMatch[1]) : 0,
    };
    return ggCache;
}

export function decodeNozomi(data: ArrayBuffer): number[] {
    const result: number[] = [];
    const bytes = new Uint8Array(data);
    for (let i = 0; i < bytes.length; i += 4) {
        result.push((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]);
    }
    return result;
}
