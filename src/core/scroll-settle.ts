// Use scrollend immediately; no additional settling timer.
export function onSettledScroll(callback: () => void): () => void {
    let scrolling = false;
    let active = true;
    const schedule = () => {
        if (scrolling || !active || document.hidden) return;
        callback();
    };
    window.addEventListener('scroll', () => { scrolling = true; }, { passive: true });
    window.addEventListener('scrollend', () => { scrolling = false; schedule(); });
    window.addEventListener('pagehide', () => { active = false; });
    window.addEventListener('pageshow', () => { active = true; scrolling = false; });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) { scrolling = false; }
    });
    // Image loads, initial restoration and bfcache restoration use the same
    // settling gate; none may bypass an in-progress scroll.
    return schedule;
}
