import { computeRequest } from './compute/transport';

export function createFavoritesSync(provider: 'hitomi' | 'imhentai'): (delayMs?: number) => void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let requestRunning = false;
    let snapshotPending = false;

    async function flush(): Promise<void> {
        // A formatted phone must choose Backup/Restore on home before publishing favorites.
        if (requestRunning || !snapshotPending) return;
        requestRunning = true;
        try {
            while (snapshotPending) {
                snapshotPending = false;
                await computeRequest('favorites-publish', provider);
            }
        } catch (error) {
            console.warn(`[gallery-reader] ${provider} favorites sync deferred until the next change or startup`, error);
        } finally {
            requestRunning = false;
        }
    }

    return (delayMs = 100): void => {
        snapshotPending = true;
        clearTimeout(timer);
        timer = setTimeout(() => void flush(), delayMs);
    };
}
