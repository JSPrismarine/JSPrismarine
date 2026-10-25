import { describe, expect, it } from 'vitest';
import { LogWindow } from './logWindow';

const list = (count: number) => Array.from({ length: count }, (_, index) => index);

function windowOf(height: number, total: number): LogWindow {
    const window = new LogWindow(height);
    window.onReset(total);
    return window;
}

describe('LogWindow', () => {
    it('starts following with the newest rows at the bottom', () => {
        const window = windowOf(5, 12);
        expect(window.follow).toBe(true);
        expect(window.offset).toBe(7);
        expect(window.slice(list(12))).toEqual([7, 8, 9, 10, 11]);
    });

    it('shows everything from the top when the list fits', () => {
        const window = windowOf(5, 3);
        expect(window.offset).toBe(0);
        expect(window.slice(list(3))).toEqual([0, 1, 2]);
    });

    it('keeps the bottom in view while following', () => {
        const window = windowOf(5, 12);
        window.onAppended(3);
        expect(window.offset).toBe(10);
        expect(window.unread).toBe(0);
    });

    it('pauses follow when scrolling up and counts lines appended while paused', () => {
        const window = windowOf(5, 12);
        window.scrollBy(-2);
        expect(window.follow).toBe(false);
        expect(window.offset).toBe(5);

        window.onAppended(4);
        expect(window.offset).toBe(5);
        expect(window.unread).toBe(4);
        window.onAppended(1);
        expect(window.unread).toBe(5);
    });

    it('resumes follow and clears unread when scrolling reaches the bottom', () => {
        const window = windowOf(5, 12);
        window.scrollBy(-3);
        window.onAppended(2);
        window.scrollBy(10);
        expect(window.offset).toBe(9);
        expect(window.follow).toBe(true);
        expect(window.unread).toBe(0);
    });

    it('does not scroll past the top', () => {
        const window = windowOf(5, 12);
        window.scrollBy(-100);
        expect(window.offset).toBe(0);
        expect(window.follow).toBe(false);
    });

    it('pages by one screen minus one row of overlap', () => {
        const window = windowOf(5, 30);
        window.pageUp();
        expect(window.offset).toBe(21);
        window.pageUp();
        expect(window.offset).toBe(17);
        window.pageDown();
        expect(window.offset).toBe(21);
        window.pageDown();
        expect(window.offset).toBe(25);
        expect(window.follow).toBe(true);
    });

    it('jumps to the top and pauses, and to the bottom and follows again', () => {
        const window = windowOf(5, 12);
        window.toTop();
        expect(window.offset).toBe(0);
        expect(window.follow).toBe(false);
        window.onAppended(2);
        expect(window.unread).toBe(2);

        window.toBottom();
        expect(window.offset).toBe(9);
        expect(window.follow).toBe(true);
        expect(window.unread).toBe(0);
    });

    it('keeps following when the list fits and lines are appended', () => {
        const window = windowOf(5, 2);
        window.scrollBy(-1);
        expect(window.follow).toBe(true);
        window.onAppended(1);
        expect(window.offset).toBe(0);
        expect(window.unread).toBe(0);
    });

    it('re-anchors to the bottom on resize while following', () => {
        const window = windowOf(5, 12);
        window.onResize(3);
        expect(window.height).toBe(3);
        expect(window.offset).toBe(9);
        expect(window.slice(list(12))).toEqual([9, 10, 11]);
    });

    it('clamps the offset on resize while paused', () => {
        const window = windowOf(5, 12);
        window.scrollBy(-1);
        window.onResize(10);
        expect(window.offset).toBe(2);
        expect(window.follow).toBe(false);
        window.onResize(20);
        expect(window.offset).toBe(0);
    });

    it('clamps the offset when the list is rebuilt and clears unread', () => {
        const window = windowOf(5, 30);
        window.scrollBy(-10);
        window.onAppended(3);
        window.onReset(8);
        expect(window.offset).toBe(3);
        expect(window.follow).toBe(false);
        expect(window.unread).toBe(0);
    });

    it('scrolls to a given index, keeping it in view', () => {
        const window = windowOf(5, 30);
        window.scrollTo(10);
        expect(window.follow).toBe(false);
        expect(window.offset).toBe(10);
        window.scrollTo(29);
        expect(window.follow).toBe(true);
        window.scrollTo(0);
        expect(window.offset).toBe(0);
    });
});
