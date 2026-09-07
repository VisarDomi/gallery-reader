import { computeRequest } from '../core/compute/transport';
let initialized: Promise<void> | undefined;
const yieldToUI = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/** The sole localStorage bridge: read old values once, without parsing or changing them. */
async function migrateLegacyStorage(): Promise<void> {
    await yieldToUI();
    if (await computeRequest<boolean>('state-ready')) return;
    const raw: Record<string, string> = {};
    for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (key && (['gallery-reader-favorites-v1', 'saved_searches', 'favorites'].includes(key) || key.startsWith('scroll-pos-'))) {
            const value = localStorage.getItem(key);
            if (value !== null) raw[key] = value;
        }
        if (index % 25 === 24) await yieldToUI();
    }
    await computeRequest('state-migrate', raw);
}
export function initializeStorage(): Promise<void> {
    if (!initialized) {
        initialized = migrateLegacyStorage();
        void initialized.catch(() => { initialized = undefined; });
    }
    return initialized;
}
