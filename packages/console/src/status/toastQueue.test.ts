import { describe, expect, it } from 'vitest';

import { ToastQueue } from './toastQueue';

describe('ToastQueue', () => {
    it('lists toasts oldest first so the newest renders at the bottom', () => {
        const queue = new ToastQueue({ maxVisible: 3, defaultTtlMs: 4000 });
        const first = queue.push({ tone: 'ok', text: 'first' }, 0);
        const second = queue.push({ tone: 'ok', text: 'second' }, 1);

        expect(queue.toasts.map((toast) => toast.id)).toEqual([first, second]);
        expect(first).not.toBe(second);
    });

    it('gives each toast an expiry from the default or its own ttl, and none when sticky', () => {
        const queue = new ToastQueue({ maxVisible: 3, defaultTtlMs: 4000 });
        queue.push({ tone: 'ok', text: 'default' }, 100);
        queue.push({ tone: 'ok', text: 'custom', ttlMs: 500 }, 100);
        queue.push({ tone: 'danger', text: 'sticky', sticky: true }, 100);

        expect(queue.toasts.map((toast) => toast.expiresAt)).toEqual([4100, 600, undefined]);
        expect(queue.nextExpiry()).toBe(600);
    });

    it('expires toasts whose ttl has passed and reports their ids', () => {
        const queue = new ToastQueue({ maxVisible: 3, defaultTtlMs: 4000 });
        const soon = queue.push({ tone: 'ok', text: 'soon', ttlMs: 500 }, 0);
        const later = queue.push({ tone: 'ok', text: 'later' }, 0);
        queue.push({ tone: 'danger', text: 'sticky', sticky: true }, 0);

        expect(queue.expire(499)).toEqual([]);
        expect(queue.expire(500)).toEqual([soon]);
        expect(queue.toasts.map((toast) => toast.id)).toEqual([later, expect.any(String)]);
        expect(queue.expire(10_000)).toEqual([later]);
        expect(queue.toasts.map((toast) => toast.text)).toEqual(['sticky']);
        expect(queue.nextExpiry()).toBeUndefined();
    });

    it('drops the oldest non-sticky toast when over maxVisible', () => {
        const queue = new ToastQueue({ maxVisible: 2, defaultTtlMs: 4000 });
        queue.push({ tone: 'danger', text: 'sticky', sticky: true }, 0);
        queue.push({ tone: 'ok', text: 'a' }, 1);
        queue.push({ tone: 'ok', text: 'b' }, 2);

        expect(queue.toasts.map((toast) => toast.text)).toEqual(['sticky', 'b']);
    });

    it('never evicts the toast just pushed, even when every older toast is sticky', () => {
        const queue = new ToastQueue({ maxVisible: 2, defaultTtlMs: 4000 });
        queue.push({ tone: 'danger', text: 'crash', sticky: true }, 0);
        queue.push({ tone: 'danger', text: 'generation failed', sticky: true }, 1);
        const id = queue.push({ tone: 'ok', text: 'restarted' }, 2);

        expect(queue.toasts.map((toast) => toast.text)).toEqual(['generation failed', 'restarted']);
        expect(queue.toasts.at(-1)?.id).toBe(id);
    });

    it('drops the oldest sticky toast when every toast is sticky and over maxVisible', () => {
        const queue = new ToastQueue({ maxVisible: 1, defaultTtlMs: 4000 });
        queue.push({ tone: 'danger', text: 'old', sticky: true }, 0);
        queue.push({ tone: 'danger', text: 'new', sticky: true }, 1);

        expect(queue.toasts.map((toast) => toast.text)).toEqual(['new']);
    });

    it('dismisses by id and clears everything', () => {
        const queue = new ToastQueue({ maxVisible: 3, defaultTtlMs: 4000 });
        const id = queue.push({ tone: 'ok', text: 'a' }, 0);
        queue.push({ tone: 'ok', text: 'b' }, 0);

        expect(queue.dismiss(id)).toBe(true);
        expect(queue.dismiss(id)).toBe(false);
        expect(queue.toasts.map((toast) => toast.text)).toEqual(['b']);

        queue.clear();
        expect(queue.toasts).toEqual([]);
    });
});
