import { preloadFavs, mergeFavs } from '../storage/db';
import { initShell } from '../ui/shell';
import { renderPaginatedGrid } from "../ui/paginated-grid";
import { getPage, savePage, saveScrollPosition, loadScrollPosition, deferScrollRestore, applyPendingScroll } from "../storage/localstorage";

const COUNT_KEY = ' Favorites';
const HOME_PAGE_SIZE = 25;

let _ids: number[] = [];

function renderPage(page: number): void {
    const start = (page - 1) * HOME_PAGE_SIZE;
    const galleryIds = _ids.slice(start, start + HOME_PAGE_SIZE);
    renderPaginatedGrid(
        galleryIds,
        page,
        _ids.length,
        HOME_PAGE_SIZE,
        COUNT_KEY,
        (newPage) => renderPage(newPage),
    );

    savePage(page);
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
    exportBtn.onclick = () => {
        textarea.value = _ids.join(' ');
        showImport();
        resizeTextarea();
    };

    mergeBtn.onclick = async () => {
        const raw = textarea.value;
        const ids = [...raw.matchAll(/\d+/g)].map(m => parseInt(m[0], 10)).filter(n => n > 0);
        if (ids.length === 0) {
            status.textContent = 'No IDs found';
            status.style.display = 'inline';
            return;
        }
        mergeBtn.disabled = true;
        mergeBtn.textContent = 'Merging...';
        try {
            const added = await mergeFavs(ids);
            status.textContent = `Added ${added} of ${ids.length} IDs${ids.length - added > 0 ? ` (${ids.length - added} already existed)` : ''}`;
            status.style.display = 'inline';
            // refresh and re-render
            _ids = await preloadFavs();
            renderPage(getPage());
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
    _ids = await preloadFavs();

    const urlKey = location.pathname;
    const savedY = loadScrollPosition(urlKey);
    if (savedY !== null) deferScrollRestore(savedY);

    const saveScroll = () => saveScrollPosition(location.pathname, window.scrollY);
    window.addEventListener('scrollend', () => {
        setTimeout(saveScroll, 100);
    });
    window.addEventListener('pagehide', saveScroll);

    if (_ids.length > 0) renderPage(getPage());
    applyPendingScroll();
    buildImportSection();
}
