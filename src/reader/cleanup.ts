export function clean(): void {
    try { window.open = function() { return null; }; } catch(e) {}

    if (document.body && document.body.getAttribute('onload')) {
        document.body.removeAttribute('onload');
    }

    // Remove ALL iframes
    document.querySelectorAll('iframe').forEach(el => el.remove());

    // Remove existing ad script tags
    document.querySelectorAll('script[src*="capndr"], script[src*="advertising"], script[src*="ad"]')
        .forEach(el => el.remove());

    // Block all pointer events via CSS
    injectPointerControlCSS();

    // Observe for new ad elements and nuke them
    nukeHostile();
    const obs = new MutationObserver(() => {
        // Nuke new ad scripts and elements
        document.querySelectorAll('script[src*="capndr"], script[src*="advertising"], script[src*="ad"]')
            .forEach(el => el.remove());
        nukeHostile();
    });
    obs.observe(document.documentElement, {childList: true, subtree: true});
}

function injectPointerControlCSS(): void {
    if (document.getElementById('hs-pointer-style')) return;
    const s = document.createElement('style');
    s.id = 'hs-pointer-style';
    s.textContent = [
        'html, body, body * { pointer-events: none !important; }',
        '[class*="hs-"] { pointer-events: auto !important; }',
        '[class*="row-"] { pointer-events: auto !important; }',
        '#hs-wrap, #hs-wrap * { pointer-events: auto !important; }',
        '#query-input, #search { pointer-events: auto !important; }',
        'img.hs-r-img { pointer-events: auto !important; }',
        'div[style*="aspect-ratio"] { pointer-events: auto !important; }',
        '.hs-modal-backdrop * { pointer-events: auto !important; }',
        '.hs-ocr-overlay, .hs-ocr-overlay * { pointer-events: auto !important; }',
    ].join('\n');
    document.head.appendChild(s);
}

function isFriendly(node: HTMLElement): boolean {
    if (node.id === 'hs-wrap' || node.id === 'hs-modal-style' || node.id === 'hs-pointer-style') return true;
    if (node.className && (node.className.indexOf('hs-') === 0 || node.className.indexOf('row-') === 0)) return true;
    if (node.className === 'hs-page-bar') return true;
    if (node.tagName === 'DIV' && node.style && node.style.aspectRatio) return true;
    if (node.tagName === 'STYLE' || node.tagName === 'LINK' || node.tagName === 'META' || node.tagName === 'BASE') return true;
    if (node.tagName === 'SCRIPT') {
        const src = (node as HTMLScriptElement).src || '';
        if (src.indexOf('gold-usergeneratedcontent') >= 0) return true;
    }
    let p = node.parentElement;
    while (p) {
        if (p.id === 'hs-wrap') return true;
        if (p.className && (p.className.indexOf('hs-') === 0 || p.className.indexOf('row-') === 0)) return true;
        if (p.tagName === 'DIV' && p.style && p.style.aspectRatio) return true;
        p = p.parentElement;
    }
    return false;
}

function isHostileOverlay(el: HTMLElement): boolean {
    if (!el || el.nodeType !== 1) return false;
    const style = window.getComputedStyle(el);
    const zIndex = parseInt(style.zIndex);
    if (style.position === 'fixed' && zIndex >= 1000 && style.opacity === '0.01') return true;
    if (zIndex >= 100000) return true;
    return false;
}

function nukeHostile(): void {
    const all = document.querySelectorAll('*');
    for (let i = 0; i < all.length; i++) {
        const el = all[i] as HTMLElement;
        if (isFriendly(el)) continue;
        if (isHostileOverlay(el)) el.remove();
    }
}
