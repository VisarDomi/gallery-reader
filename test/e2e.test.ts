/**
 * E2E tests — no-op placeholder.
 *
 * These tests require a real browser (Safari iOS swipe-back caching, DOM events,
 * hashchange, pagereveal, async image loading). Left as no-op until browser
 * automation is wired up.
 */
import { describe, it } from 'vitest';

describe('e2e', () => {
  it.todo('swipe back from reader to search restores cached search page', () => {});
  it.todo('swipe back goes to previous search (not previous page within same search)', () => {});
  it.todo('swipe back from search result page 2 goes to info modal', () => {});
  it.todo('search input fills from URL on pagereveal event', () => {});
  it.todo('hashchange updates saved search and pagination', () => {});
  it.todo('thumbnail click opens reader at correct image position', () => {});
  it.todo('info modal loads metadata async and displays provider-specific fields', () => {});
  it.todo('gallery row skeleton created before async content fill', () => {});
  it.todo('reader skeleton created before async image load', () => {});
  it.todo('saved search dropdown shows 3 by default, expands on click', () => {});
  it.todo('favorite toggle persists to localStorage', () => {});
});
