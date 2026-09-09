// Hitomi's current search.js reads this JSON index. Data only, in the worker:
// no jQuery ready hook, common.js ad startup, or site-owned navigation handler.
export interface Suggestion { name: string; count: number; namespace: string }
let controller: AbortController | undefined;
export async function suggestions(raw: string): Promise<Suggestion[]> {
    controller?.abort();
    const current = controller = new AbortController();
    const query = raw.toLowerCase().replace(/_/g, ' ');
    const colon = query.indexOf(':');
    const field = colon < 0 ? 'global' : query.slice(0, colon);
    const term = colon < 0 ? query : query.slice(colon + 1);
    if (!/^[a-z]+$/.test(field) || !term) return [];
    const characters = term.split('').map(character =>
        encodeURIComponent(character === ' ' ? '_' : character === '/' ? 'slash' : character === '.' ? 'dot' : character));
    const response = await fetch('https://tagindex.hitomi.la/' + field + '/' + characters.join('/') + '.json', { signal: current.signal });
    if (response.status === 404) return [];
    if (!response.ok) throw new Error('Hitomi suggestions HTTP ' + response.status);
    const data: unknown = await response.json();
    if (!Array.isArray(data)) throw new Error('Invalid Hitomi suggestions');
    return data.slice(0, 100).map(row => {
        if (!Array.isArray(row) || typeof row[0] !== 'string' || !Number.isFinite(row[1]) || typeof row[2] !== 'string') {
            throw new Error('Invalid Hitomi suggestion');
        }
        return { name: row[0], count: row[1], namespace: row[2] };
    });
}
