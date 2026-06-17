/**
 * Saved searches — business rules from test.md lines 18-19:
 *   - Saved to localStorage on search query execution
 *   - Ordered by most recent
 *
 * Tests the real module at src/storage/localstorage.ts.
 * Pure data logic — no DOM needed. Callback is stubbed.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { loadSearches, saveSearch, removeSearch } from '../src/storage/localstorage';

const noop = () => {};

beforeEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// loadSearches
// ---------------------------------------------------------------------------

describe('loadSearches', () => {
  it('returns empty array when no saved searches exist', () => {
    expect(loadSearches()).toEqual([]);
  });

  it('returns parsed searches from localStorage', () => {
    localStorage.setItem('hitomi_saved_searches', JSON.stringify([
      { query: 'artist:mizuki' },
      { query: 'language:english', page: 2 },
    ]));
    expect(loadSearches()).toEqual([
      { query: 'artist:mizuki' },
      { query: 'language:english', page: 2 },
    ]);
  });

  it('returns empty array for corrupted JSON', () => {
    localStorage.setItem('hitomi_saved_searches', '{broken');
    expect(loadSearches()).toEqual([]);
  });

  it('returns empty array for non-array JSON', () => {
    localStorage.setItem('hitomi_saved_searches', '"a-string"');
    expect(loadSearches()).toEqual([]);
  });

  it('filters out entries without valid query', () => {
    localStorage.setItem('hitomi_saved_searches', JSON.stringify([
      { query: 'valid' },
      { page: 1 },
      null,
      { query: 'also-valid' },
    ]));
    expect(loadSearches()).toEqual([
      { query: 'valid' },
      { query: 'also-valid' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// saveSearch
// ---------------------------------------------------------------------------

describe('saveSearch', () => {
  it('saves a new search with page', () => {
    saveSearch('artist:mizuki', 1, noop);
    const saved = loadSearches();
    expect(saved).toHaveLength(1);
    expect(saved[0].query).toBe('artist:mizuki');
    expect(saved[0].page).toBe(1);
  });

  it('trims whitespace before saving', () => {
    saveSearch('  artist:mizuki  ', 1, noop);
    expect(loadSearches()[0].query).toBe('artist:mizuki');
  });

  it('ignores empty queries', () => {
    saveSearch('', 1, noop);
    saveSearch('   ', 1, noop);
    expect(loadSearches()).toEqual([]);
  });

  it('orders by most recent — newest first', () => {
    saveSearch('first', 1, noop);
    saveSearch('second', 1, noop);
    saveSearch('third', 1, noop);
    expect(loadSearches().map((s) => s.query)).toEqual(['third', 'second', 'first']);
  });

  it('re-searching an existing query moves it to front and updates page', () => {
    saveSearch('a', 1, noop);
    saveSearch('b', 1, noop);
    saveSearch('c', 1, noop);
    saveSearch('a', 5, noop);
    expect(loadSearches()).toEqual([
      { query: 'a', page: 5 },
      { query: 'c', page: 1 },
      { query: 'b', page: 1 },
    ]);
  });

  it('calls the callback after saving', () => {
    let called = false;
    saveSearch('x', 1, () => { called = true; });
    expect(called).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// removeSearch
// ---------------------------------------------------------------------------

describe('removeSearch', () => {
  it('removes a search by query string', () => {
    saveSearch('a', 1, noop);
    saveSearch('b', 1, noop);
    removeSearch('a', noop);
    expect(loadSearches().map((s) => s.query)).toEqual(['b']);
  });

  it('removing non-existent query is a no-op', () => {
    saveSearch('a', 1, noop);
    removeSearch('nonexistent', noop);
    expect(loadSearches()).toHaveLength(1);
  });

  it('calls the callback after removing', () => {
    saveSearch('x', 1, noop);
    let called = false;
    removeSearch('x', () => { called = true; });
    expect(called).toBe(true);
  });
});
