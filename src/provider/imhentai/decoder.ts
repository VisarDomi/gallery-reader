import {DOMAIN, LANG_PARAM} from "./constants";

export async function fetchText(url: string): Promise<string> {
    const resp = await fetch(url, { credentials: 'include' });
    if (!resp.ok) throw Error(`HTTP ${resp.status}`);
    return resp.text();
}

export function extractBetween(html: string, start: string, end: string, fromIndex = 0): { value: string; nextIndex: number } | null {
    const s = html.indexOf(start, fromIndex);
    if (s === -1) return null;
    const e = html.indexOf(end, s + start.length);
    if (e === -1) return null;
    return { value: html.slice(s + start.length, e), nextIndex: e + end.length };
}

export function extractAll(html: string, start: string, end: string): string[] {
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

export function buildImhentaiSearchUrl(query: string, page?: number): string {
    let { language, namespaces, keywords } = parseImhentaiQuery(query.trim());

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

    // namespace + language → convert namespace to keyword for search endpoint
    if (language && namespaces.length === 1 && keywords.length === 0) {
        keywords = [namespaces[0].value];
        namespaces = [];
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

    params.set('key', keywords.map(k => k.replace(/[_-]/g, ' ')).join(','));

    let url = `https://${DOMAIN}/search/?${params.toString()}`;
    if (page !== undefined) url += '&page=' + page;
    return url;
}
