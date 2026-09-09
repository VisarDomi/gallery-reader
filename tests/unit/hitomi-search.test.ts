import { afterEach, expect, it, vi } from 'vitest';
import { intersectNozomi } from '../../src/provider/hitomi/decoder';
import { suggestions } from '../../src/provider/hitomi/suggestions';
afterEach(() => vi.unstubAllGlobals());
const binary = (ids: number[]) => {
    const bytes = new ArrayBuffer(ids.length * 4);
    ids.forEach((id, index) => new DataView(bytes).setUint32(index * 4, id));
    return new Response(bytes);
};
it('overlaps requests while preserving intersection, exclusions and result order', async () => {
    const data: Record<string, number[]> = { a: [4, 3, 2, 1], b: [2, 4, 3], c: [3] };
    let active = 0, peak = 0;
    const fetch = vi.fn(async (url: string) => {
        peak = Math.max(peak, ++active);
        await new Promise(resolve => setTimeout(resolve, 5));
        active--;
        const tag = /tag\/(.*)-all/.exec(url)![1];
        return binary(data[tag]);
    });
    vi.stubGlobal('fetch', fetch);
    expect(await intersectNozomi(['a', 'b'], ['c', 'c'])).toEqual([2, 4]);
    expect(peak).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(3);
});
it('bounds concurrent traffic for a huge exclusion query', async () => {
    let active = 0, peak = 0;
    vi.stubGlobal('fetch', async () => {
        peak = Math.max(peak, ++active);
        await new Promise(resolve => setTimeout(resolve, 1));
        active--;
        return binary([1, 2]);
    });
    expect(await intersectNozomi(['a'], Array.from({ length: 55 }, (_, i) => 'excluded' + i))).toEqual([]);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(6);
});
it('does not turn a failed term fetch into an apparently successful incomplete search', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 503 }));
    await expect(intersectNozomi(['a'], [])).rejects.toThrow('503');
});
it('uses the source JSON suggestion path and decodes it as data', async () => {
    const fetch = vi.fn(async () => Response.json([['some tag', 13, 'female']]));
    vi.stubGlobal('fetch', fetch);
    expect(await suggestions('female:some_t')).toEqual([{ name: 'some tag', count: 13, namespace: 'female' }]);
    expect(fetch.mock.calls[0][0]).toBe('https://tagindex.hitomi.la/female/s/o/m/e/_/t.json');
});
