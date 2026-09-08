// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
const { applyPendingScroll, backupHome } = vi.hoisted(() => ({ applyPendingScroll: vi.fn(), backupHome: vi.fn() }));
vi.mock('../../src/storage/favorites', () => ({
    homePage: async () => ({ page: 1, ids: [1, 2], total: 2 }),
    importFavs: vi.fn(), exportFavs: vi.fn(),
}));
vi.mock('../../src/storage/preferences', () => ({
    savePage: () => new Promise(() => {}), applyPendingScroll,
}));
vi.mock('../../src/ui/shell', () => ({ initShell: async () => {} }));
vi.mock('../../src/ui/paginated-grid', () => ({ renderPaginatedGrid: vi.fn() }));
vi.mock('../../src/ui/saved-searches', () => ({ render: vi.fn() }));
vi.mock('../../src/provider', () => ({ backupHome, scheduleFavoritesSync: vi.fn() }));
import { init } from '../../src/routes/home';

it('finishes home setup and restores position even while page persistence is pending', async () => {
    await init();
    expect(applyPendingScroll).toHaveBeenCalledOnce();
    expect(backupHome).toHaveBeenCalledOnce();
    expect(document.querySelector('button')?.textContent).toBe('Import / Merge');
});
