import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { handleFatalErrors } from './fatal';

type FatalEvents = { uncaughtException: [Error]; unhandledRejection: [unknown] };

const flush = () => new Promise((done) => setTimeout(done, 0));

const setup = (close = vi.fn(async () => {})) => {
    const source = new EventEmitter<FatalEvents>();
    const forceStop = vi.fn();
    const exit = vi.fn<(code: number) => void>();
    const stderr = vi.fn<(text: string) => void>();
    const off = handleFatalErrors({ supervisor: { forceStop }, ui: { close }, exit, stderr }, source);
    return { source, forceStop, exit, stderr, close, off };
};

describe('handleFatalErrors', () => {
    it('kills the child, closes the UI, reports the error, and exits 1 on an uncaught exception', async () => {
        const t = setup();

        t.source.emit('uncaughtException', new Error('boom'));
        expect(t.forceStop).toHaveBeenCalledTimes(1);
        expect(t.exit).not.toHaveBeenCalled();
        await flush();

        expect(t.close).toHaveBeenCalledTimes(1);
        expect(t.stderr.mock.calls[0]?.[0]).toMatch(/Error: boom/);
        expect(t.exit).toHaveBeenCalledWith(1);
    });

    it('treats an unhandled rejection the same way, even one that is not an Error', async () => {
        const t = setup();

        t.source.emit('unhandledRejection', 'denied');
        await flush();

        expect(t.forceStop).toHaveBeenCalledTimes(1);
        expect(t.stderr.mock.calls[0]?.[0]).toContain('denied');
        expect(t.exit).toHaveBeenCalledWith(1);
    });

    it('still exits when closing the UI fails', async () => {
        const t = setup(
            vi.fn(async () => {
                throw new Error('renderer already destroyed');
            })
        );

        t.source.emit('uncaughtException', new Error('boom'));
        await flush();

        expect(t.exit).toHaveBeenCalledWith(1);
    });

    it('acts once and can be removed', async () => {
        const t = setup();

        t.source.emit('uncaughtException', new Error('first'));
        t.source.emit('uncaughtException', new Error('second'));
        await flush();
        expect(t.forceStop).toHaveBeenCalledTimes(1);
        expect(t.exit).toHaveBeenCalledTimes(1);

        t.off();
        expect(t.source.listenerCount('uncaughtException')).toBe(0);
        expect(t.source.listenerCount('unhandledRejection')).toBe(0);
    });
});
