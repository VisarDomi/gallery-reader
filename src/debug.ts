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
    (window as any).hsLog = log;

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

    // ── bfcache / page lifecycle monitors ──────────────────────
    log('--- bfcache monitors active ---', '#f0f');

    // sentinel: capture init-time state
    const input = document.getElementById('query-input') as HTMLInputElement;
    log(`INIT-STATE search="${window.location.search}" input.value="${input?.value ?? 'NO-ELEMENT'}" readyState=${document.readyState}`, '#ff0');

    // 1) pageshow — canonical bfcache restore detection
    window.addEventListener('pageshow', (e) => {
        const inp = (document.getElementById('query-input') as HTMLInputElement)?.value ?? 'NO-EL';
        log(`PAGESHOW persisted=${e.persisted} search="${window.location.search}" input="${inp}"`, e.persisted ? '#0f0' : '#888');
    });

    // 2) pagehide — fires when entering bfcache (or unloading)
    window.addEventListener('pagehide', (e) => {
        log(`PAGEHIDE persisted=${e.persisted}`, e.persisted ? '#0f0' : '#f80');
    });

    // 3) visibilitychange — fires on tab switch AND bfcache restore
    document.addEventListener('visibilitychange', () => {
        const inp = (document.getElementById('query-input') as HTMLInputElement)?.value ?? 'NO-EL';
        log(`VISIBILITY visible=${!document.hidden} search="${window.location.search}" input="${inp}"`, '#0cf');
    });

    // 4) freeze / resume — Page Lifecycle API (Chromium, not Safari)
    document.addEventListener('freeze', () => { log('FREEZE', '#c0f'); });
    document.addEventListener('resume', () => {
        const inp = (document.getElementById('query-input') as HTMLInputElement)?.value ?? 'NO-EL';
        log(`RESUME search="${window.location.search}" input="${inp}"`, '#c0f');
    });

    // 5) focus / blur
    window.addEventListener('focus', () => {
        log(`FOCUS search="${window.location.search}" input="${(document.getElementById('query-input') as HTMLInputElement)?.value ?? 'NO-EL'}"`, '#fa0');
    });
    window.addEventListener('blur', () => { log('BLUR', '#fa0'); });

    // 6) popstate — history navigation
    window.addEventListener('popstate', () => {
        log(`POPSTATE search="${window.location.search}" input="${(document.getElementById('query-input') as HTMLInputElement)?.value ?? 'NO-EL'}"`, '#af0');
    });

    // 7) load / DOMContentLoaded — should NOT fire on bfcache restore
    window.addEventListener('load', () => {
        log(`LOAD search="${window.location.search}"`, '#888');
    });
    document.addEventListener('DOMContentLoaded', () => { log('DOMContentLoaded', '#888'); });

    // 8) beforeunload — bfcache eligibility check (Safari allows it, Chrome/Firefox don't)
    window.addEventListener('beforeunload', () => { log('BEFOREUNLOAD', '#f44'); });

    // 9) unload — known bfcache killer, log if it fires
    window.addEventListener('unload', () => { log('UNLOAD — page is dying', '#f00'); });

    // 10) navigation timing — check if navigated via back/forward
    try {
        const navEntries = performance.getEntriesByType('navigation');
        const navType = navEntries.length > 0 ? (navEntries[0] as any).type : 'N/A';
        const oldType = (performance.navigation as any)?.type ?? 'N/A';
        log(`NAV-TYPE=new=${navType} old=${oldType}`, '#ff0');
    } catch { log('NAV-TYPE=ERROR', '#f44'); }

    // 11) document.wasDiscarded (Safari 17+)
    if ('wasDiscarded' in document) {
        log(`wasDiscarded=${(document as any).wasDiscarded}`, '#ff0');
    }

    // 12) mutation observer on input value attribute
    if (input) {
        const mo = new MutationObserver((muts) => {
            for (const m of muts) {
                log(`INPUT-MUTATION attr=${m.attributeName} val="${input.value}"`, '#f8f');
            }
        });
        mo.observe(input, { attributes: true, attributeFilter: ['value'] });
        // polling: MutationObserver doesn't catch .value = x (property, not attribute)
        let lastVal = input.value;
        setInterval(() => {
            if (input.value !== lastVal) {
                log(`INPUT-VALUE-CHANGED "${lastVal}" -> "${input.value}"`, '#f8f');
                lastVal = input.value;
            }
        }, 250);
    }

    // 13) pagereveal — newer event, Safari may support it
    window.addEventListener('pagereveal', () => {
        log(`PAGEREVEAL search="${window.location.search}"`, '#af0');
    });

    // 14) global sentinel — survives across bfcache if page was cached
    (window as any).__bfcacheSentinel = (window as any).__bfcacheSentinel || 0;
    (window as any).__bfcacheSentinel++;
    log(`SENTINEL=${(window as any).__bfcacheSentinel} (1=first init, >1 if init ran again)`, '#ff0');

    // 15) also use the property form (some old Safari inconsistencies)
    const origOnPageShow = window.onpageshow;
    window.onpageshow = (e) => {
        log(`ONPAGESHOW persisted=${e.persisted}`, '#fa0');
        if (origOnPageShow) origOnPageShow.call(window, e);
    };

    // ── bfcache fix-approach tests ──────────────────────────────
    const query = decodeURIComponent(window.location.search.replace(/^\?/, ''));
    function fixSet(tag: string) {
        if (input && query) input.value = query;
        log(`${tag} query="${query}" input="${input?.value ?? 'NO-EL'}"`, '#0f0');
    }

    // 1) pageshow + setTimeout(0)
    window.addEventListener('pageshow', (e) => {
        if (!e.persisted) return;
        log('fix-setTimeout scheduling', '#0f0');
        setTimeout(() => fixSet('fix-setTimeout'), 0);
    });

    // 2) pageshow + queueMicrotask
    window.addEventListener('pageshow', (e) => {
        if (!e.persisted) return;
        log('fix-microtask scheduling', '#0f0');
        queueMicrotask(() => fixSet('fix-microtask'));
    });

    // 3) pageshow + rAF
    window.addEventListener('pageshow', (e) => {
        if (!e.persisted) return;
        log('fix-rAF scheduling', '#0f0');
        requestAnimationFrame(() => fixSet('fix-rAF'));
    });

    // 4) pageshow + double set (now + setTimeout(0))
    window.addEventListener('pageshow', (e) => {
        if (!e.persisted) return;
        log('fix-double-1 scheduling', '#0f0');
        if (input && query) input.value = query;
        setTimeout(() => fixSet('fix-double-2'), 0);
    });

    // 5) pagereveal
    window.addEventListener('pagereveal', () => {
        log('fix-pagereveal scheduling', '#0f0');
        fixSet('fix-pagereveal');
    });

    // 6) visibilitychange (when visible)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            log('fix-visibility scheduling', '#0f0');
            fixSet('fix-visibility');
        }
    });

    // 7) focus
    window.addEventListener('focus', () => {
        log('fix-focus scheduling', '#0f0');
        fixSet('fix-focus');
    });

    // 8) MutationObserver — detect Safari clear, re-set
    if (input) {
        let moTimeout: ReturnType<typeof setTimeout> | null = null;
        const mo = new MutationObserver(() => {
            if (input.value !== query && query) {
                log('fix-mo clearing detected, re-setting', '#0f0');
                input.value = query;
                if (moTimeout) clearTimeout(moTimeout);
                moTimeout = setTimeout(() => {
                    fixSet('fix-mo-final');
                    moTimeout = null;
                }, 500);
            }
        });
        mo.observe(input, { attributes: true, attributeFilter: ['value'] });
    }

    // 9) polling — brute force 200ms intervals for 2s after pageshow
    window.addEventListener('pageshow', (e) => {
        if (!e.persisted) return;
        log('fix-poll starting', '#0f0');
        for (let i = 1; i <= 10; i++) {
            setTimeout(() => fixSet(`fix-poll-${i * 200}ms`), i * 200);
        }
    });

    log('all-fix-approaches REGISTERED', '#ff0');
}
