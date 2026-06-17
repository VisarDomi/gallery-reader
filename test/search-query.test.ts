/**
 * Search query parsing — business rules from test.md line 18:
 *   - Positive and negative search terms
 *   - All negative or empty query → "language:japanese" as the positive query
 *
 * Tests the real parseQuery() from src/routes/search.ts.
 * Pure function — no mocks needed.
 */
import { describe, it, expect } from 'vitest';
import {parseQuery} from "../src/core/query-parser";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseQuery', () => {
  it('empty query defaults to language:japanese', () => {
    expect(parseQuery('')).toEqual({ positive: ['language:japanese'], negative: [] });
  });

  it('whitespace-only query defaults to language:japanese', () => {
    expect(parseQuery('   ')).toEqual({ positive: ['language:japanese'], negative: [] });
  });

  it('single positive term', () => {
    expect(parseQuery('artist:mizuki')).toEqual({ positive: ['artist:mizuki'], negative: [] });
  });

  it('multiple positive terms', () => {
    expect(parseQuery('artist:mizuki language:japanese')).toEqual({
      positive: ['artist:mizuki', 'language:japanese'],
      negative: [],
    });
  });

  it('single negative term defaults positive to language:japanese', () => {
    expect(parseQuery('-loli')).toEqual({ positive: ['language:japanese'], negative: ['loli'] });
  });

  it('all negative terms defaults to language:japanese positive', () => {
    expect(parseQuery('-loli -yaoi')).toEqual({
      positive: ['language:japanese'],
      negative: ['loli', 'yaoi'],
    });
  });

  it('mixed positive and negative terms', () => {
    expect(parseQuery('artist:mizuki -loli')).toEqual({
      positive: ['artist:mizuki'],
      negative: ['loli'],
    });
  });

  it('multiple positives and negatives', () => {
    expect(parseQuery('group:oreno artist:mizuki -loli -yaoi')).toEqual({
      positive: ['group:oreno', 'artist:mizuki'],
      negative: ['loli', 'yaoi'],
    });
  });

  it('bare dash is ignored', () => {
    expect(parseQuery('foo -')).toEqual({ positive: ['foo'], negative: [] });
  });

  it('multiple consecutive spaces are collapsed', () => {
    expect(parseQuery('  foo   -bar  ')).toEqual({
      positive: ['foo'],
      negative: ['bar'],
    });
  });
});
