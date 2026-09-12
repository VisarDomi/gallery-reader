// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { onSettledScroll } from '../../src/core/scroll-settle';

let windowListeners: ReturnType<typeof vi.spyOn>;
let documentListeners: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
    vi.useFakeTimers();
    windowListeners = vi.spyOn(window, 'addEventListener');
    documentListeners = vi.spyOn(document, 'addEventListener');
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
});
afterEach(() => {
    for (const [type, callback] of windowListeners.mock.calls) window.removeEventListener(type, callback);
    for (const [type, callback] of documentListeners.mock.calls) document.removeEventListener(type, callback);
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

it('saves immediately on scrollend without a settling timer', () => {
    const save = vi.fn();
    onSettledScroll(save);
    dispatchEvent(new Event('scrollend'));
    expect(save).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(1);
});

it('ignores image-load requests during scrolling, then saves at scrollend', () => {
    const save = vi.fn();
    const request = onSettledScroll(save);
    dispatchEvent(new Event('scroll'));
    request();
    vi.advanceTimersByTime(200);
    expect(save).not.toHaveBeenCalled();
    dispatchEvent(new Event('scrollend'));
    expect(save).toHaveBeenCalledTimes(1);
});

it('ignores suspended work and accepts fresh work after bfcache restoration', () => {
    const save = vi.fn();
    const request = onSettledScroll(save);
    dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    request();
    dispatchEvent(new Event('scrollend'));
    expect(save).not.toHaveBeenCalled();
    dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    expect(save).not.toHaveBeenCalled();
    request();
    expect(save).toHaveBeenCalledTimes(1);
});

it('never writes while hidden or replays hidden work on visibility change', () => {
    const save = vi.fn();
    onSettledScroll(save);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    dispatchEvent(new Event('scrollend'));
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(1000);
    expect(save).not.toHaveBeenCalled();
    dispatchEvent(new Event('scrollend'));
    expect(save).toHaveBeenCalledTimes(1);
});
