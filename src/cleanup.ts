export function clean(): void {
    window.open = function () {
        return null;
    };
    if (document.body && document.body.getAttribute('onload')) {
        document.body.removeAttribute('onload');
    }
    const iframes = document.querySelectorAll('iframe');
    for (let i = 0; i < iframes.length; i++) {
        iframes[i].remove();
    }
    setTimeout(function () {
        const obs = new MutationObserver(function (mutations) {
            for (let i = 0; i < mutations.length; i++) {
                for (let j = 0; j < mutations[i].addedNodes.length; j++) {
                    const node = mutations[i].addedNodes[j] as HTMLElement;
                    if (node.nodeType !== 1) continue;
                    if (isOwn(node)) continue;
                    node.remove();
                }
            }
        });
        obs.observe(document.documentElement, {childList: true, subtree: true});
    }, 0);
}

function isOwn(node: HTMLElement): boolean {
    if (node.id === 'hs-wrap') return true;
    if (node.className && (node.className.indexOf('hs-') === 0 || node.className.indexOf('row-') === 0)) return true;
    if (node.tagName === 'DIV' && node.style && node.style.aspectRatio) return true;
    if (node.tagName === 'STYLE' || node.tagName === 'LINK' || node.tagName === 'META' || node.tagName === 'BASE') return true;
    if (node.tagName === 'SCRIPT') {
        const src = (node as HTMLScriptElement).src || '';
        if (src.indexOf('gold-usergeneratedcontent') >= 0 || src.indexOf('jquery') >= 0) return true;
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
