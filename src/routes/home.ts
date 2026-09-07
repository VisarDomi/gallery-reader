import { homePage, importFavs, exportFavs } from '../storage/favorites';
import { initShell } from '../ui/shell';
import { renderPaginatedGrid } from "../ui/paginated-grid";
import { savePage, applyPendingScroll } from "../storage/preferences";
import { render as renderSavedSearches } from '../ui/saved-searches';
import { scheduleFavoritesSync, backupHome } from '../provider';

let generation = 0;
async function renderPage(requestedPage?: number): Promise<void> {
    const current = ++generation;
    const HOME_PAGE_SIZE = 25;
    const { page, ids: galleryIds, total } = await homePage(requestedPage);
    if (generation !== current) return;
    renderPaginatedGrid(
        galleryIds,
        page,
        total,
        HOME_PAGE_SIZE,
        ' Favorites',
        (newPage) => renderPage(newPage),
    );

    await savePage(page);
}

function buildImportSection(): void {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'text-align:center;margin:16px 0';

    const btn = document.createElement('button');
    btn.textContent = 'Import / Merge';
    btn.style.cssText = 'background:#333;color:#ccc;border:1px solid #555;border-radius:4px;padding:6px 16px;font:13px monospace;cursor:pointer';

    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Paste gallery IDs (space, newline, comma separated)';
    textarea.style.cssText = 'display:none;width:100%;max-width:500px;min-height:40px;margin:8px auto;padding:8px;background:#111;color:#aaa;border:1px solid #555;border-radius:4px;font:13px monospace;resize:none;overflow:hidden;box-sizing:border-box';
    const resizeTextarea = () => {
        textarea.style.height = '0px';
        textarea.style.height = textarea.scrollHeight + 'px';
    };
    textarea.addEventListener('input', resizeTextarea);

    const mergeBtn = document.createElement('button');
    mergeBtn.textContent = 'Merge';
    mergeBtn.style.cssText = 'display:none;background:#4a4;color:#fff;border:none;border-radius:4px;padding:6px 16px;font:13px monospace;cursor:pointer;margin-left:8px';

    const exportBtn = document.createElement('button');
    exportBtn.textContent = 'Export';
    exportBtn.style.cssText = 'background:#333;color:#ccc;border:1px solid #555;border-radius:4px;padding:6px 16px;font:13px monospace;cursor:pointer;margin-left:8px';

    const status = document.createElement('span');
    status.style.cssText = 'display:none;color:#aaa;font:12px monospace;margin-left:8px';

    const showImport = () => {
        textarea.style.display = 'block';
        mergeBtn.style.display = 'inline-block';
        btn.style.display = 'none';
        status.style.display = 'none';
    };

    btn.onclick = showImport;
    exportBtn.onclick = async () => {
        textarea.value = await exportFavs();
        showImport();
        resizeTextarea();
    };

    mergeBtn.onclick = async () => {
        const raw = textarea.value;
        mergeBtn.disabled = true;
        mergeBtn.textContent = 'Merging...';
        try {
            const { added, total } = await importFavs(raw);
            if (added > 0) scheduleFavoritesSync();
            status.textContent = total ? `Added ${added} of ${total} IDs` : 'No IDs found';
            status.style.display = 'inline';
            await renderPage();
        } catch (e) {
            status.textContent = 'Error: ' + (e as Error).message;
            status.style.display = 'inline';
        } finally {
            mergeBtn.disabled = false;
            mergeBtn.textContent = 'Merge';
        }
    };

    wrap.appendChild(btn);
    wrap.appendChild(textarea);
    wrap.appendChild(mergeBtn);
    wrap.appendChild(exportBtn);
    wrap.appendChild(status);
    document.body.appendChild(wrap);
}

export async function init(): Promise<void> {
    await initShell();
    await renderPage();
    buildImportSection();
    applyPendingScroll();
    window.addEventListener('reader-data-restored', () => { void renderPage(); void renderSavedSearches(); });
    // Rendering local content never waits for the backup PC or the setup choice.
    void backupHome();
}
