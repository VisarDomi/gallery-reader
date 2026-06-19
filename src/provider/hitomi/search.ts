import {DOMAIN} from "./constants";
import {decodeNozomi} from "./decoder";

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

export async function intersectNozomi(positive: string[], negative: string[]): Promise<number[]> {
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
