// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../src/core/compute/transport', () => ({ computeRequest: vi.fn() }));
import { beginScrollRestore, deferScrollRestore, applyPendingScroll } from '../../src/storage/preferences';

let frames: FrameRequestCallback[];
beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => frames.push(frame));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    beginScrollRestore();
});
afterEach(() => {
    window.dispatchEvent(new Event('pointerdown'));
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('restores the saved position once when the user has not interacted', () => {
    deferScrollRestore(1200);
    applyPendingScroll();
    frames.shift()!(0);
    expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith(0, 1200);
    applyPendingScroll();
    expect(frames).toHaveLength(0);
});

it.each(['pointerdown', 'touchstart', 'wheel', 'keydown'])('never overrides %s while storage is still loading', type => {
    window.dispatchEvent(new Event(type));
    deferScrollRestore(0);
    applyPendingScroll();
    frames.forEach(frame => frame(0));
    expect(window.scrollTo).not.toHaveBeenCalled();
});

it('does not jump if the user starts interacting before the scheduled restore frame', () => {
    deferScrollRestore(0);
    applyPendingScroll();
    window.dispatchEvent(new Event('touchstart'));
    frames.forEach(frame => frame(0));
    expect(window.scrollTo).not.toHaveBeenCalled();
});
