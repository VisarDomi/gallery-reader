import { provider as hitomi } from '../../provider/hitomi/data-provider';
import { provider as imhentai } from '../../provider/imhentai/data-provider';
import { accessState, hasState, migrateState, captureState, restoreState, describeState } from './state';
import { backupControl, type BackupCommand } from '../backup-engine';
import { setPageReferrer } from './context';
import { suggestions } from '../../provider/hitomi/suggestions';

interface Request { id: number; op: string; payload: any }
async function handle({ op, payload }: Request): Promise<unknown> {
    if (op === 'hitomi-suggestions') return suggestions(payload);
    if (op === 'provider') {
        setPageReferrer(payload.referrer);
        const provider = payload.provider === 'hitomi' ? hitomi : imhentai;
        if (payload.method === 'getGalleryThumbnails') {
            return (await provider.getGalleryThumbnails(payload.args[0])).map(thumb => ({ url: provider.thumbUrl(thumb) }));
        }
        if (!['search', 'getMeta', 'getReaderData', 'imageUrls'].includes(payload.method)) throw new Error('Unknown provider operation');
        return (provider[payload.method as keyof typeof provider] as Function).apply(provider, payload.args);
    }
    if (op === 'state-ready') return hasState();
    if (op === 'state-migrate') return migrateState(payload);
    if (op === 'backup-control') return backupControl(payload as BackupCommand, {
        capture: async () => { await writes; return captureState(); },
        restore: async data => {
            const restored = writes.then(() => restoreState(data));
            writes = restored.catch(() => {});
            await restored;
        },
        stats: describeState,
    });
    if (op === 'favorites-publish') {
        if (!await backupControl({ action: 'enrolled', scope: 'gallery-reader:' + payload }, { capture: captureState, restore: restoreState, stats: describeState })) return;
        await writes;
        const data = await accessState(state => ({ result: JSON.stringify({ ids: state!.favorites }) }));
        const base = (import.meta.env.VITE_GALLERY_SERVER_URL ?? 'https://192.168.1.197:7777').replace(/\/$/, '');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
            const response = await fetch(base + '/api/favorites/' + payload, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: data, signal: controller.signal });
            if (!response.ok) throw new Error('Favorites sync HTTP ' + response.status);
        } finally { clearTimeout(timer); }
        return;
    }
    const mutate = ['favorite-toggle', 'favorite-import', 'search-save', 'search-remove', 'page-save', 'scroll-save'].includes(op);
    return accessState(state => {
        if (!state) throw new Error('Reader storage has not been initialized');
        let result: unknown;
        switch (op) {
            case 'favorites': result = state.favorites; break;
            case 'favorites-export': result = state.favorites.join(' '); break;
            case 'favorites-json': result = JSON.stringify({ ids: state.favorites }); break;
            case 'favorite-is': result = state.favorites.includes(payload); break;
            case 'favorite-toggle': {
                if (!Number.isSafeInteger(payload) || payload <= 0) throw new Error('Invalid gallery ID');
                const index = state.favorites.indexOf(payload);
                if (index < 0) state.favorites.unshift(payload); else state.favorites.splice(index, 1);
                result = index < 0;
                break;
            }
            case 'favorite-import': {
                const ids = [...String(payload).matchAll(/\d+/g)].map(m => Number(m[0])).filter(id => Number.isSafeInteger(id) && id > 0);
                const existing = new Set(state.favorites);
                const added = ids.filter(id => { if (existing.has(id)) return false; existing.add(id); return true; });
                state.favorites.unshift(...added);
                result = { added: added.length, total: ids.length };
                break;
            }
            case 'home-page': {
                const page = Math.max(1, Math.min(payload ?? state.page, Math.max(1, Math.ceil(state.favorites.length / 25))));
                result = { page, ids: state.favorites.slice((page - 1) * 25, page * 25), total: state.favorites.length };
                break;
            }
            case 'searches': result = state.searches; break;
            case 'search-save': {
                const query = payload.query.trim();
                if (query) state.searches = [{ query, page: payload.page }, ...state.searches.filter(s => s.query !== query)];
                break;
            }
            case 'search-remove': state.searches = state.searches.filter(s => s.query !== payload); break;
            case 'page': result = state.page; break;
            case 'page-save': state.page = payload; break;
            case 'scroll': result = state.scroll[payload] ?? null; break;
            case 'scroll-save': state.scroll[payload.key] = payload.y; break;
            default: throw new Error('Unknown storage operation: ' + op);
        }
        return { result, next: mutate ? state : undefined };
    }, mutate);
}

let writes = Promise.resolve();
self.onmessage = (event: MessageEvent<Request>) => {
    const request = event.data;
    const task = async () => {
        try { self.postMessage({ id: request.id, ok: true, value: await handle(request) }); }
        catch (error) { self.postMessage({ id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) }); }
    };
    // Slow provider requests never hold up storage writes or backup acknowledgements.
    if (['provider', 'hitomi-suggestions', 'backup-control', 'favorites-publish'].includes(request.op)) void task(); else writes = writes.then(task);
};
