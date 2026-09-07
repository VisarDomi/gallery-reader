import { describe, it, expect } from 'vitest';
import { parseGalleryHTML } from '../../src/provider/imhentai/provider';

const base = 'https://m9.imhentai.xxx/028/jnwqbic1ea/';
function fixture(thumbnail = `${base}1t.jpg`) {
    const pages = Object.fromEntries(Array.from({ length: 144 }, (_, i) => [i + 1, `${i === 4 ? 'w' : i === 1 ? 'p' : 'j'},1254,1771`]));
    return `<img data-src="${base}cover.jpg"><img data-src="${thumbnail}"><script>var g_th = $.parseJSON('${JSON.stringify(pages)}');</script>`;
}

describe('IMHentai thumbnails and originals', () => {
    it('uses source JPEG thumbnails for PNG/WebP originals, including beyond the first ten pages', () => {
        const { thumbs, images, pageCount } = parseGalleryHTML(fixture(), 1362775);
        expect(pageCount).toBe(144);
        expect(thumbs).toHaveLength(144);
        expect(thumbs[1].url).toBe(`${base}2t.jpg`);
        expect(thumbs[4].url).toBe(`${base}5t.jpg`);
        expect(thumbs[143].url).toBe(`${base}144t.jpg`);
        expect(images[1]).toEqual({ url: `${base}2.png`, width: 1254, height: 1771 });
        expect(images[4].url).toBe(`${base}5.webp`);
        expect(images[143].url).toBe(`${base}144.jpg`);
        expect(thumbs.every((thumb, i) => thumb.url !== images[i].url)).toBe(true);
    });
    it('preserves the source thumbnail format, query string, and explicitly listed exceptions', () => {
        const html = fixture(`${base}1t.webp?token=source`) + `<img data-src='${base}2t.jpg'>`;
        const { thumbs } = parseGalleryHTML(html, 1362775);
        expect(thumbs[4].url).toBe(`${base}5t.webp?token=source`);
        expect(thumbs[1].url).toBe(`${base}2t.jpg`);
    });
    it('keeps the non-JSON fallback on thumbnails too', () => {
        const { thumbs, images } = parseGalleryHTML(`<img data-src="${base}1t.jpg"><input id="load_pages" value="12">`, 1362775);
        expect(thumbs[11].url).toBe(`${base}12t.jpg`);
        expect(images[11].url).toBe(`${base}12.jpg`);
    });
    it('does not silently substitute full images when source thumbnails are absent', () => {
        const { thumbs, images } = parseGalleryHTML(fixture().replace(`<img data-src="${base}1t.jpg">`, ''), 1362775);
        expect(thumbs.every(thumb => thumb.url === '')).toBe(true);
        expect(images[4].url).toBe(`${base}5.webp`);
    });
});
