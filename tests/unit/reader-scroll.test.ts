// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
vi.mock('../../src/provider', () => ({
    getReaderData: async () => ({ images: Array.from({ length: 3 }, () => ({ width: 100, height: 300 })) }),
    imageUrls: async () => ['one.jpg', 'two.jpg', 'three.jpg'],
    readerUrl: (gid: number, index: number) => `/reader/${gid}#${index}`,
}));
vi.mock('../../src/core/image-retry', () => ({ registerImage: () => {} }));
import { open } from '../../src/routes/reader';

it('bookmarks the settled midpoint without adding history, and ignores non-reader hits', async () => {
    vi.useFakeTimers();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    document.body.replaceChildren();
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const listen = vi.spyOn(window, 'addEventListener');
    const documentListen = vi.spyOn(document, 'addEventListener');
    const replace = vi.spyOn(history, 'replaceState');
    const hit = vi.fn();
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: hit });
    try {
        await open(7, 0);
        const images = [...document.querySelectorAll<HTMLImageElement>('.hs-reader-img')];
        expect(images).toHaveLength(3);
        expect(images.every(image => image.loading === 'lazy')).toBe(true);
        const length = history.length;
        hit.mockReturnValue(images[1]);
        dispatchEvent(new Event('scrollend'));
        expect(replace).toHaveBeenLastCalledWith(null, '', '/reader/7?f=0.000#1');
        expect(history.length).toBe(length);
        const calls = replace.mock.calls.length;
        for (const element of [null, document.body, document.createElement('img')]) {
            hit.mockReturnValue(element);
            dispatchEvent(new Event('scrollend'));
            vi.advanceTimersByTime(100);
        }
        expect(replace).toHaveBeenCalledTimes(calls);
        hit.mockReturnValue(images[2]);
        // The screen's centre is halfway down this image.
        vi.spyOn(images[2], 'getBoundingClientRect').mockReturnValue({ top: innerHeight / 2 + 1 - 150, height: 300 } as DOMRect);
        dispatchEvent(new Event('scrollend'));
        vi.advanceTimersByTime(100);
        expect(replace).toHaveBeenLastCalledWith(null, '', '/reader/7?f=0.500#2');
    } finally {
        for (const [type, callback] of listen.mock.calls) window.removeEventListener(type, callback);
        for (const [type, callback] of documentListen.mock.calls) document.removeEventListener(type, callback);
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.restoreAllMocks();
    }
});

it('a reloaded reader puts the saved point of its image at the screen centre', async () => {
    document.body.replaceChildren();
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    history.replaceState(null, '', '/?read=hitomi-7&page=2&f=0.25');
    const top = vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockReturnValue(1000);
    const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(400);
    try {
        await open(7, 1);
        expect(scroll).toHaveBeenLastCalledWith(0, 1000 + 0.25 * 400 - innerHeight / 2);
    } finally {
        top.mockRestore(); height.mockRestore();
        history.replaceState(null, '', '/');
        vi.restoreAllMocks();
    }
});
