// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
const { save } = vi.hoisted(() => ({ save: vi.fn(async () => {}) }));
vi.mock('../../src/provider', () => ({ initProvider: vi.fn(), searchUrl: () => '/' }));
vi.mock('../../src/ui/saved-searches', () => ({ render: async () => {} }));
vi.mock('../../src/storage/initialize', () => ({ initializeStorage: async () => {} }));
vi.mock('../../src/storage/preferences', () => ({
    beginScrollRestore: vi.fn(), deferScrollRestore: vi.fn(),
    loadScrollPosition: async () => null, saveScrollPosition: save, loadSearches: async () => [],
}));
import { initShell } from '../../src/ui/shell';
it('saves active scrolling, but never starts a final database write during suspension', async () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    await initShell();
    window.dispatchEvent(new Event('scrollend'));
    expect(save).toHaveBeenCalledTimes(1);
    hidden.mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    window.dispatchEvent(new Event('scrollend'));
    expect(save).toHaveBeenCalledTimes(1);
    hidden.mockRestore();
});
