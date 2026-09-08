// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
vi.mock('../../src/provider', () => ({
    getReaderData: async () => ({ images: Array.from({ length: 3 }, () => ({ width: 100, height: 300 })) }),
    imageUrls: async () => ['one.jpg', 'two.jpg', 'three.jpg'],
    readerUrl: (gid: number, index: number) => `/reader/${gid}#${index}`,
}));
vi.mock('../../src/core/image-retry', () => ({ registerImage: () => {} }));
import { open } from '../../src/routes/reader';

it('bookmarks immediately without adding history, and ignores non-reader midpoint hits', async () => {
    document.body.replaceChildren();
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const listen = vi.spyOn(window, 'addEventListener');
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
        expect(replace).toHaveBeenLastCalledWith(null, '', '/reader/7#1');
        expect(history.length).toBe(length);
        const calls = replace.mock.calls.length;
        for (const element of [null, document.body, document.createElement('img')]) {
            hit.mockReturnValue(element);
            dispatchEvent(new Event('scrollend'));
        }
        expect(replace).toHaveBeenCalledTimes(calls);
        hit.mockReturnValue(images[2]);
        dispatchEvent(new Event('scrollend'));
        expect(replace).toHaveBeenLastCalledWith(null, '', '/reader/7#2');
    } finally {
        for (const [type, callback] of listen.mock.calls) window.removeEventListener(type, callback);
        vi.restoreAllMocks();
    }
});
