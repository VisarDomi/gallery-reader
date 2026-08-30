import { getFavs } from '../storage/favorites';

const GALLERY_SERVER_URL = (
    (import.meta.env.VITE_GALLERY_SERVER_URL as string | undefined)
    ?? 'https://192.168.1.197:7777'
).replace(/\/$/, '');

export function createFavoritesSync(provider: 'hitomi' | 'imhentai'): (delayMs?: number) => void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let requestRunning = false;
    let snapshotPending = false;

    function putSnapshot(ids: number[]): Promise<void> {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'PUT',
                url: `${GALLERY_SERVER_URL}/api/favorites/${provider}`,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify({ ids }),
                timeout: 5_000,
                onload: response => {
                    if (response.status >= 200 && response.status < 300) resolve();
                    else reject(new Error(`${provider} favorites sync returned HTTP ${response.status}`));
                },
                onerror: () => reject(new Error(`${provider} favorites sync request failed`)),
                ontimeout: () => reject(new Error(`${provider} favorites sync request timed out`)),
            });
        });
    }

    async function flush(): Promise<void> {
        if (requestRunning || !snapshotPending) return;
        requestRunning = true;
        try {
            while (snapshotPending) {
                snapshotPending = false;
                await putSnapshot(getFavs());
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
