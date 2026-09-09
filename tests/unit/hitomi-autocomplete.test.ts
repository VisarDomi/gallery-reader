// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../src/core/compute/transport', () => ({ computeRequest: request }));
import { setupAutocomplete } from '../../src/provider/hitomi/autocomplete';
let input: HTMLTextAreaElement;
beforeEach(() => {
    request.mockReset();
    document.body.innerHTML = '<div><textarea id="query-input"></textarea></div>';
    input = document.querySelector('textarea')!;
    setupAutocomplete();
});
function type(value: string, cursor = value.length): void {
    input.value = value;
    input.setSelectionRange(cursor, cursor);
    input.dispatchEvent(new Event('input'));
}
it('works without document-ready or jQuery and preserves exclusions when selecting a source suggestion', async () => {
    request.mockResolvedValue([{ name: 'test tag', namespace: 'female', count: 12 }]);
    type('language:japanese -female:te');
    await vi.waitFor(() => expect(document.querySelector('a')).not.toBeNull());
    expect(request).toHaveBeenCalledWith('hitomi-suggestions', 'female:te');
    (document.querySelector('a') as HTMLAnchorElement).click();
    expect(input.value).toBe('language:japanese -female:test_tag ');
    expect(document.querySelector('#search-suggestions')!.children.length).toBe(0);
});
it('replaces the term at the caret, preserving the rest of a large query', async () => {
    request.mockResolvedValue([{ name: 'example', namespace: 'artist', count: 7 }]);
    type('artist:ex language:japanese -male:test', 9);
    await vi.waitFor(() => expect(document.querySelector('a')).not.toBeNull());
    (document.querySelector('a') as HTMLAnchorElement).click();
    expect(input.value).toBe('artist:example language:japanese -male:test');
});
it('never shows stale results after more typing or clearing the input', async () => {
    let finish!: (value: unknown) => void;
    request.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    type('test');
    type('');
    finish([{ name: 'late', namespace: 'tag', count: 2 }]);
    await Promise.resolve();
    expect(document.querySelector('a')).toBeNull();
});
it('Enter accepts keyboard selection without also submitting a search', async () => {
    request.mockResolvedValue([{ name: '<img>', namespace: 'tag', count: 1 }]);
    type('test');
    await vi.waitFor(() => expect(document.querySelector('a')).not.toBeNull());
    expect(document.querySelector('img')).toBeNull();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }));
    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    input.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(input.value).toBe('tag:<img> ');
});
