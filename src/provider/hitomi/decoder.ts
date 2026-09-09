import {DOMAIN} from "./constants";
import { pageReferrer } from '../../core/compute/context';

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
    const resp = await fetch(url, { referrer: referer ?? pageReferrer() });
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
    if (!defaultOffsetMatch) throw new Error('Hitomi gg.js did not contain the default host offset');
    if (!basePathMatch || basePathMatch[1] === '') throw new Error('Hitomi gg.js did not contain the image base path');
    ggCache = {
        multiplierMap,
        basePath: basePathMatch[1].replace(/\/$/, ''),
        defaultOffset: parseInt(defaultOffsetMatch[1]),
    };
    return ggCache;
}

function decodeNozomi(data: ArrayBuffer): number[] {
    if (data.byteLength % 4 !== 0) throw new Error(`Invalid Nozomi response length: ${data.byteLength}`);
    const result: number[] = [];
    const view = new DataView(data);
    for (let i = 0; i < view.byteLength; i += 4) {
        result.push(view.getUint32(i));
    }
    return result;
}

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
        referrer: pageReferrer(),
    });
    if (!resp.ok) throw new Error(`Nozomi request failed: ${resp.status}`);
    return decodeNozomi(await resp.arrayBuffer());
}

export async function intersectNozomi(positive: string[], negative: string[]): Promise<number[]> {
    const included = [...new Set(positive)];
    if (!included.length) return [];
    // Six independent requests at a time, not a serial network round trip per
    // exclusion. Consume/release each response rather than retaining every set.
    async function each(terms: string[], consume: (ids: number[], index: number) => void): Promise<void> {
        let cursor = 0;
        let failed = false;
        await Promise.all(Array.from({ length: Math.min(6, terms.length) }, async () => {
            while (!failed) {
                const index = cursor++;
                if (index >= terms.length) return;
                try { consume(await searchGalleries(terms[index]), index); }
                catch (error) { failed = true; throw error; }
            }
        }));
    }
    let idSet: Set<number> | undefined;
    let order: number[] = [];
    await each(included, (ids, index) => {
        // Preserve the old result order (the final positive term's ordering),
        // regardless of which network response happens to arrive first.
        if (index === included.length - 1) order = ids;
        if (!idSet) idSet = new Set(ids);
        else {
            const allowed = new Set(ids);
            for (const id of idSet) if (!allowed.has(id)) idSet.delete(id);
        }
    });
    if (!idSet?.size) return [];
    await each([...new Set(negative)], ids => {
        for (const id of ids) idSet!.delete(id);
    });
    return [...new Set(order)].filter(id => idSet!.has(id));
}
