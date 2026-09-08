/** Temporary native-device diagnostic, compiled out of normal builds. */
export function installPerformanceProbe(): void {
    const p = {
        id: Math.random().toString(36), born: performance.now(),
        frames: [] as number[], ticks: [] as number[],
        shows: [] as { persisted: boolean; epoch: number; at: number }[],
        hides: [] as { persisted: boolean; epoch: number }[],
        firstFrame: 0, restoredFrameEpoch: 0, raf: 0, timer: 0,
        stop: () => {},
    };
    Object.defineProperty(window, '__grPerf', { value: p, configurable: true });
    let lastFrame = performance.now(), lastTick = performance.now(), active = true;
    const show = (event: PageTransitionEvent) => {
        p.shows.push({ persisted: event.persisted, epoch: Date.now(), at: performance.now() });
        lastFrame = lastTick = performance.now();
        requestAnimationFrame(() => requestAnimationFrame(() => { p.restoredFrameEpoch = Date.now(); }));
    };
    const hide = (event: PageTransitionEvent) => {
        p.hides.push({ persisted: event.persisted, epoch: Date.now() });
        lastFrame = lastTick = 0;
    };
    function frame(now: number): void {
        if (!active) return;
        // Reattach after document.open, without duplicating listeners.
        window.addEventListener('pageshow', show);
        window.addEventListener('pagehide', hide);
        if (!document.hidden && lastFrame && p.frames.length < 1200) p.frames.push(now - lastFrame);
        if (!p.firstFrame) p.firstFrame = now;
        lastFrame = document.hidden ? 0 : now;
        p.raf = requestAnimationFrame(frame);
    }
    function tick(): void {
        if (!active) return;
        const now = performance.now();
        if (now - p.born > 30000) { p.stop(); return; }
        if (!document.hidden && lastTick && p.ticks.length < 1200) p.ticks.push(now - lastTick);
        lastTick = document.hidden ? 0 : now;
        p.timer = window.setTimeout(tick, 16);
    }
    p.stop = () => {
        active = false;
        cancelAnimationFrame(p.raf);
        clearTimeout(p.timer);
        window.removeEventListener('pageshow', show);
        window.removeEventListener('pagehide', hide);
    };
    requestAnimationFrame(frame);
    window.setTimeout(tick, 16);
}
