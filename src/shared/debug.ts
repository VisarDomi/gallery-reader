export function setupDebug() {
    // ── panel ─────────────────────────────────────────────────
    const logEl = document.createElement('div');
    logEl.id = 'hs-debug-log';
    logEl.style.cssText = 'position:sticky;top:0;z-index:99999;background:#0a0a12;color:#aaa;font:12px/1.4 monospace;max-height:200px;overflow-y:auto;padding:4px 8px;border-bottom:1px solid #333;display:flex;flex-direction:column';

    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:2px;flex-shrink:0';
    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy log';
    copyBtn.style.cssText = 'background:#333;color:#ccc;border:1px solid #555;border-radius:3px;padding:2px 8px;font:11px monospace;cursor:pointer';
    toolbar.appendChild(copyBtn);
    logEl.appendChild(toolbar);

    const logBody = document.createElement('div');
    logBody.style.cssText = 'flex:1;overflow-y:auto';
    logEl.appendChild(logBody);

    const logEntries: string[] = [];
    const rawLines: string[] = [];
    function log(msg: string, color = '#aaa') {
        const t = performance.now().toFixed(0);
        const html = `<span style="color:${color}">[${t}] ${msg}</span>`;
        const raw = `[${t}] ${msg.replace(/<[^>]+>/g, '')}`;
        logEntries.unshift(html);
        rawLines.unshift(raw);
        if (logEntries.length > 50) { logEntries.length = 50; rawLines.length = 50; }
        logBody.innerHTML = logEntries.join('<br>');
    }

    // ── copy ──────────────────────────────────────────────────
    function fallbackCopy(text: string) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
        document.body.appendChild(ta);
        const isIOS = /ipad|iphone|ipod/i.test(navigator.userAgent);
        if (isIOS) {
            const range = document.createRange();
            range.selectNodeContents(ta);
            const sel = window.getSelection()!;
            sel.removeAllRanges();
            sel.addRange(range);
            ta.setSelectionRange(0, 999999);
        } else {
            ta.select();
        }
        try { document.execCommand('copy'); copyBtn.textContent = 'Copied!'; } catch { copyBtn.textContent = 'Failed'; }
        setTimeout(() => { copyBtn.textContent = 'Copy log'; ta.remove(); }, 1500);
    }

    copyBtn.onclick = () => {
        const text = rawLines.join('\n');
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                copyBtn.textContent = 'Copied!';
                setTimeout(() => { copyBtn.textContent = 'Copy log'; }, 1500);
            }).catch(() => fallbackCopy(text));
        } else {
            fallbackCopy(text);
        }
    };

    document.body.insertBefore(logEl, document.body.firstChild);
    log('debug panel ready', '#6af');

    // ── event monitors ────────────────────────────────────────
    const sugg = document.getElementById('search-suggestions')!;
    const searchWrap = sugg.parentElement!;

    for (const ev of ['pointerdown', 'mousedown', 'click'] as const) {
        sugg.addEventListener(ev, (e) => {
            const t = e.target as Element;
            const tag = t.tagName;
            const cls = t.className?.toString?.() ?? '';
            const txt = (t as HTMLElement).textContent?.slice(0, 30) ?? '';
            log(`${ev} CAPTURE on &lt;${tag.toLowerCase()}&gt; ."${cls}" "${txt}"`, '#8f8');
        }, true);
    }

    document.addEventListener('click', (e) => {
        const t = e.target as Element;
        const insideInput = !!(t as HTMLElement).closest?.('#query-input');
        log(`click CAPTURE document → insideInput=${insideInput} target=&lt;${t.tagName.toLowerCase()}&gt;`, '#f88');
    }, true);

    sugg.addEventListener('click', (e) => {
        const a = (e.target as Element).closest('a');
        if (a) log('click BUBBLE on <a> — href handler should fire now', '#ff0');
    });

    // ── .active monitor ───────────────────────────────────────
    const activeObserver = new MutationObserver(() => {
        const active = searchWrap.classList.contains('active');
        log(`.active ${active ? 'ADDED' : 'REMOVED'} on hs-search-input`, active ? '#8af' : '#f84');
    });
    activeObserver.observe(searchWrap, { attributes: true, attributeFilter: ['class'] });
    log('monitoring .active class toggles', '#8af');

    // ── function wrappers ─────────────────────────────────────
    const origClearPage = (window as any).clear_page as Function | undefined;
    if (origClearPage) {
        (window as any).clear_page = function () {
            log('clear_page() called — dropdown HTML cleared', '#fa0');
            return origClearPage();
        };
        log('wrapped clear_page()', '#fa0');
    }

    const origToPage = (window as any).to_page as Function | undefined;
    if (origToPage) {
        (window as any).to_page = function (result: any) {
            log(`to_page("${result.s?.slice(0, 20) ?? ''}") ns="${result.n ?? ''}" t="${result.t ?? ''}"`, '#0f0');
            return origToPage.call(this, result);
        };
        log('wrapped to_page()', '#0f0');
    }

    const origGSQ = (window as any).get_suggestions_for_query as Function | undefined;
    if (origGSQ) {
        (window as any).get_suggestions_for_query = function (term: string, serial: number) {
            log(`get_suggestions_for_query("${term}", serial=${serial})`, '#c0f');
            const p = origGSQ.call(this, term, serial);
            if (p?.then) {
                p.then((r: any) => {
                    const [results] = r || [];
                    log(`← suggestions returned: ${results?.length ?? 0} results`, '#c0f');
                }, (err: any) => {
                    log(`← suggestions FAILED: ${err?.message ?? err}`, '#f44');
                });
            }
            return p;
        };
        log('wrapped get_suggestions_for_query()', '#c0f');
    }

    log('all monitors active — click a dropdown item', '#6af');
}
