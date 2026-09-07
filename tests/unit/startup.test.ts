// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
const { calls } = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock('../../src/storage/backup', () => ({
    galleryHomeBackup: () => async () => {},
}));
import { startInit } from '../../src/ui/shell';
import { initializeProviderRoute, providers } from '../../src/provider';
import { Handler } from '../../src/provider';

it('opens the requested page from native Hitomi hashes and plain userscript hashes', () => {
    expect(providers.hitomi.matchRoute('/reader/123.html', '', '#6-')).toEqual({ handler: Handler.Reader, gid: 123, index: 5 });
    expect(providers.hitomi.matchRoute('/reader/123.html', '', '#5')).toEqual({ handler: Handler.Reader, gid: 123, index: 5 });
    expect(providers.hitomi.matchRoute('/reader/123.html', '', '#invalid')).toEqual({ handler: Handler.Reader, gid: 123, index: 0 });
});

it('route matching does not schedule sync or access storage', () => {
    const sync = vi.spyOn(providers.hitomi, 'scheduleFavoritesSync');
    const storage = vi.spyOn(Storage.prototype, 'getItem');
    expect(initializeProviderRoute('hitomi.la', '/unmatched-path', '', '')).toBeNull();
    expect(initializeProviderRoute('hitomi.la', '/', '', '')).not.toBeNull();
    expect(sync).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    vi.restoreAllMocks();
});
it('takeover does only stop/open/close and UI work, without starting storage', () => {
    calls.length = 0;
    vi.spyOn(window, 'stop').mockImplementation(() => { calls.push('stop'); });
    vi.spyOn(document, 'open').mockImplementation(() => { calls.push('open'); return document; });
    vi.spyOn(document, 'close').mockImplementation(() => { calls.push('close'); });
    startInit('Reader');
    expect(calls).toEqual(['stop', 'open', 'close']);
    vi.restoreAllMocks();
});
