export async function native<T = any>(command: string, args = {}): Promise<T> {
    return JSON.parse(await window.webkit.messageHandlers.gallery.postMessage({command, args}));
}
export const localImage = (url: string) => `gallery://app/image?url=${encodeURIComponent(url)}`;
