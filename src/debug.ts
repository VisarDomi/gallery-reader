// ── imhentai bfcache investigation debug ──────────────────────
// Run from shell.ts: `if (providerName() === 'imhentai') setupDebug();`

export function setupDebug() {
    const isMobile = /ipad|iphone|ipod/i.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    // ═══════════════════════════════════════════════════════════
    // Debug panel (sticky log UI)
    // ═══════════════════════════════════════════════════════════
    const logEl = document.createElement('div');
    logEl.id = 'hs-debug-log';
    logEl.style.cssText = isMobile
        ? 'position:sticky;top:0;z-index:99999;background:#0a0a12;color:#aaa;font:10px/1.3 monospace;max-height:140px;overflow-y:auto;padding:3px 6px;border-bottom:1px solid #333;display:flex;flex-direction:column;-webkit-overflow-scrolling:touch'
        : 'position:sticky;top:0;z-index:99999;background:#0a0a12;color:#aaa;font:12px/1.4 monospace;max-height:200px;overflow-y:auto;padding:4px 8px;border-bottom:1px solid #333;display:flex;flex-direction:column';

    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:2px;flex-shrink:0';
    const titleEl = document.createElement('span');
    titleEl.textContent = `bfcache debug — ${isSafari ? 'Safari' : 'other'}${isMobile ? ' mobile' : ''}`;
    titleEl.style.cssText = 'color:#6af;font:11px monospace';
    toolbar.appendChild(titleEl);
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
        if (logEntries.length > 100) { logEntries.length = 100; rawLines.length = 100; }
        logBody.innerHTML = logEntries.join('<br>');
    }
    (window as any).hsLog = log;

    copyBtn.onclick = () => {
        const text = rawLines.join('\n');
        const doCopy = (t: string) => {
            if (navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(t).then(() => {
                    copyBtn.textContent = 'Copied!';
                    setTimeout(() => { copyBtn.textContent = 'Copy log'; }, 1500);
                }).catch(() => fallbackCopy(t));
            } else {
                fallbackCopy(t);
            }
        };
        const fallbackCopy = (t: string) => {
            const ta = document.createElement('textarea');
            ta.value = t;
            ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
            document.body.appendChild(ta);
            if (isMobile) { const r = document.createRange(); r.selectNodeContents(ta); const s = window.getSelection()!; s.removeAllRanges(); s.addRange(r); ta.setSelectionRange(0, 999999); }
            else { ta.select(); }
            try { document.execCommand('copy'); copyBtn.textContent = 'Copied!'; } catch { copyBtn.textContent = 'Failed'; }
            setTimeout(() => { copyBtn.textContent = 'Copy log'; ta.remove(); }, 1500);
        };
        doCopy(text);
    };

    document.body.insertBefore(logEl, document.body.firstChild);
    log(`bfcache investigation — imhentai ${isSafari ? '(Safari)' : '(Chromium)'}`, '#6af');

    // ═══════════════════════════════════════════════════════════
    // Page snapshot
    // ═══════════════════════════════════════════════════════════
    const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'));
    log(`SCRIPTS: ${scripts.length}`, '#ff0');
    scripts.forEach(s => log(`  ${s.src.slice(0, 100)}`, '#555'));

    const iframes = Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe'));
    log(`IFRAMES: ${iframes.length}`, '#ff0');
    iframes.forEach(f => log(`  src="${f.src.slice(0, 60)}" id="${f.id || '(none)'}"`, '#555'));

    const onProps = (['onunload','onbeforeunload','onpagehide'] as const)
        .filter(p => (window as any)[p] !== null)
        .map(p => `${p}=${typeof (window as any)[p]}`);
    log(`window handlers: ${onProps.length ? onProps.join(', ') : 'none'}`, onProps.length ? '#f80' : '#0f0');

    log(`localStorage keys: ${localStorage.length}`, '#888');
    log(`document.readyState: ${document.readyState}`, '#888');

    // ═══════════════════════════════════════════════════════════
    // notRestoredReasons — Chrome-only API, absent on Safari
    // ═══════════════════════════════════════════════════════════
    let nrrSupported = false;
    try {
        const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
        const nav = navEntries[0];
        const navType = nav ? (nav as any).type : 'N/A';
        log(`NAV-TYPE: ${navType}`, '#ff0');

        const hasNRR = nav && 'notRestoredReasons' in nav;
        log(`notRestoredReasons API: ${hasNRR ? 'available' : 'NOT available (expected on Safari)'}`, hasNRR ? '#0f0' : '#888');

        if (hasNRR) {
            nrrSupported = true;
            const nrr = (nav as any).notRestoredReasons;
            if (nrr === undefined) {
                log('  value: undefined (fresh navigation)', '#888');
            } else if (nrr === null) {
                log('  value: null — bfcache NOT blocked ✓', '#0f0');
            } else if (nrr.reasons && nrr.reasons.length > 0) {
                log(`  BLOCKED — ${nrr.reasons.length} reason(s):`, '#f44');
                for (const r of nrr.reasons) log(`    • ${r.reason}`, '#f44');
                if (nrr.children && nrr.children.length > 0) {
                    for (const c of nrr.children) {
                        const cr = c.reasons?.map((r: any) => r.reason).join(', ') || 'none';
                        log(`    iframe id="${c.id || '?'}" reasons=[${cr}]`, '#f44');
                    }
                }
            } else {
                log(`  value: ${JSON.stringify(nrr)}`, '#888');
            }
        }
    } catch(e) {
        log(`notRestoredReasons error: ${(e as Error).message}`, '#f44');
    }

    // ═══════════════════════════════════════════════════════════
    // Page lifecycle monitors (Chrome + Safari)
    // ═══════════════════════════════════════════════════════════
    log('--- lifecycle monitors active ---', '#f0f');

    // pageshow is THE bfcache signal on Safari
    window.addEventListener('pageshow', (e) => {
        const persisted = e.persisted;
        log(`PAGESHOW persisted=${persisted}`, persisted ? '#0f0' : '#888');
        if (persisted) {
            log('  → bfcache RESTORE confirmed ✓', '#0f0');
            if (nrrSupported) {
                try {
                    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
                    const nrr = (nav as any)?.notRestoredReasons;
                    if (nrr && nrr.reasons) {
                        log('  notRestoredReasons (post-restore):', '#f44');
                        for (const r of nrr.reasons) log(`    • ${r.reason}`, '#f44');
                    }
                } catch {}
            }
        }
    });

    // pagehide — persisted=true means entering bfcache
    window.addEventListener('pagehide', (e) => {
        log(`PAGEHIDE persisted=${e.persisted}`, e.persisted ? '#0f0' : '#f80');
        if (e.persisted) log('  → entering bfcache', '#0f0');
    });

    document.addEventListener('visibilitychange', () => {
        log(`VISIBILITY visible=${!document.hidden}`, '#0cf');
    });

    window.addEventListener('beforeunload', () => {
        log('BEFOREUNLOAD fired — may block bfcache on Chrome/Firefox', '#f44');
    });

    window.addEventListener('popstate', () => {
        log('POPSTATE', '#af0');
    });

    // ═══════════════════════════════════════════════════════════
    // Sentinel — survives bfcache freeze/thaw if bfcache worked
    // ═══════════════════════════════════════════════════════════
    (window as any).__bfcacheSentinel = ((window as any).__bfcacheSentinel || 0) + 1;
    const sentinel = (window as any).__bfcacheSentinel;
    if (sentinel > 1) {
        log(`SENTINEL=${sentinel} — init re-ran → bfcache did NOT work ✗`, '#f44');
    } else {
        log(`SENTINEL=${sentinel} (will be >1 on next init if bfcache fails)`, '#ff0');
    }

    // wasDiscarded — Safari 17+
    if ('wasDiscarded' in document) {
        log(`wasDiscarded=${(document as any).wasDiscarded}`, '#ff0');
    }

    // ═══════════════════════════════════════════════════════════
    // Intercept addEventListener for bfcache-killing registrations
    // ═══════════════════════════════════════════════════════════
    const origAddEventListener = EventTarget.prototype.addEventListener;
    const breakingEvents = ['unload', 'beforeunload'];
    EventTarget.prototype.addEventListener = function(
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | AddEventListenerOptions,
    ) {
        if (breakingEvents.includes(type) && listener) {
            const targetName = this === window ? 'window' :
                               this === document ? 'document' :
                               this === document.body ? 'body' :
                               (this as Element).tagName?.toLowerCase?.() ?? '?';
            log(`addEventListener("${type}") on ${targetName} — BREAKS BFCACHE`, '#f00');
            try { throw new Error(); } catch(e) {
                const stack = (e as Error).stack?.split('\n').slice(1, 4).join(' ← ') ?? '';
                log(`  trace: ${stack}`, '#f44');
            }
        }
        return origAddEventListener.call(this, type, listener, options);
    };
    log('addEventListener interceptor: watching for unload/beforeunload', '#f80');

    // ═══════════════════════════════════════════════════════════
    // Intercept sendBeacon — triggers no-store-with-js-network-request
    // ═══════════════════════════════════════════════════════════
    if (navigator.sendBeacon) {
        const origSendBeacon = navigator.sendBeacon.bind(navigator);
        navigator.sendBeacon = function(url: string | URL, data?: BodyInit | null) {
            log(`sendBeacon → ${String(url).slice(0, 80)}`, '#f80');
            return origSendBeacon(url, data);
        };
        log('sendBeacon interceptor active', '#f80');
    }

    // ═══════════════════════════════════════════════════════════
    // Summary
    // ═══════════════════════════════════════════════════════════
    log('---', '#6af');
    if (!nrrSupported) {
        log('⚠ notRestoredReasons API not available. Rely on SENTINEL + PAGESHOW.persisted to judge bfcache.', '#fa0');
    }
    log('READY — navigate away, then back. Watch for PAGESHOW persisted=true (✓) or SENTINEL>1 (✗).', '#6af');
}
