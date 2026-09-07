import { expect, it } from 'vitest';
import { legacyState, validateBackup } from '../../src/core/compute/state';

it('legacy migration preserves favorites, saved searches, page and all scroll positions', () => {
    const state = legacyState({
        'gallery-reader-favorites-v1': '[42,7]',
        saved_searches: '[{"query":"artist:test","page":2}]',
        favorites: '3',
        'scroll-pos-/reader/42': '1234',
        'site-auth': 'not copied',
    });
    expect(state).toEqual({ favorites: [42, 7], searches: [{ query: 'artist:test', page: 2 }], page: 3, scroll: { '/reader/42': 1234 } });
    expect(validateBackup({ version: 1, indexedDB: state }).indexedDB).toEqual(state);
});
it('malformed legacy values and invalid restore are rejected before committing', () => {
    expect(() => legacyState({ 'gallery-reader-favorites-v1': '[0]' })).toThrow();
    expect(() => legacyState({ saved_searches: '[{"query":7}]' })).toThrow();
    expect(() => legacyState({ favorites: '-1' })).toThrow();
    expect(() => validateBackup({ version: 99, indexedDB: {} })).toThrow();
});
it('a fresh phone gets an empty valid state', () => {
    expect(legacyState({})).toEqual({ favorites: [], searches: [], page: 1, scroll: {} });
});
