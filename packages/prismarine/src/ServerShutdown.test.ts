import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Logger } from '@jsprismarine/logger';

import Server from './Server';
import type SessionManager from './SessionManager';
import type { ServerTicker } from './modules/ticker';
import { stub } from './testing/stub.test.helper';

/**
 * Interrupting a server that is already shutting down.
 *
 * The console freezing during world generation was three defects, and this file covers the
 * third: `shutdown` opened with `if (this.stopping) return`, so once a shutdown had begun
 * there was no way left to stop the process from a terminal. Every Ctrl+C after the first
 * returned immediately and did nothing, while the first one waited on a world save that was
 * itself queued behind minutes of chunk generation.
 *
 * The first interrupt also has to hand the kernel back its default handling before it awaits
 * anything, because everything below that first await is at the mercy of an event loop that
 * a generating server does not give up.
 */

/** The members of a `Server` the shutdown path below actually reaches. */
const shutdownServer = (fields: Record<string, unknown> = {}): Server =>
    // `Object.create` is the one boundary a test double like this crosses, as in
    // `testing/stub.test.helper.ts`: `shutdown` reads private fields, which no object literal
    // typed as `Server` can supply.
    Object.assign(Object.create(Server.prototype), {
        logger: stub<Logger>({ info: () => {} }),
        interruptHolds: new Set<() => void>(),
        stopping: false,
        console: undefined,
        raknet: undefined,
        sessionManager: stub<SessionManager>({ getAllPlayers: () => [] }),
        ticker: stub<ServerTicker>({ stop: () => {} }),
        disable: async () => {},
        removeAllListeners: () => {},
        ...fields
    });

describe('Server shutdown', () => {
    /** Catches the force exit, and the ordinary one, without taking the runner down. */
    let exit: ReturnType<typeof vi.spyOn>;
    /** Everything written straight to the terminal rather than through the logger. */
    let written: string[];

    beforeEach(() => {
        exit = vi.spyOn(process, 'exit').mockImplementation(((): never => undefined as never) as never);
        written = [];
        vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
            written.push(String(chunk));
            return true;
        });
        vi.spyOn(console, 'debug').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('forces an exit when a shutdown is asked for while one is running', () => {
        const server = shutdownServer({ stopping: true });

        void server.shutdown();

        expect(exit).toHaveBeenCalledWith(1);
    });

    it('says the exit is being forced, on stderr rather than through the logger', () => {
        const server = shutdownServer({ stopping: true });

        void server.shutdown();

        expect(written.join('')).toContain('Forcing exit');
    });

    it('leaves a `stayAlive` caller alone, so a second /stop does not kill the process', () => {
        const server = shutdownServer({ stopping: true });

        void server.shutdown({ stayAlive: true });

        expect(exit).not.toHaveBeenCalled();
    });

    it('hands the interrupt back before it awaits anything', () => {
        const released: string[] = [];
        const server = shutdownServer();
        server.releaseOnShutdown(() => released.push('raw mode'));
        server.releaseOnShutdown(() => released.push('signal listeners'));

        // Deliberately not awaited. A release that only ran after the first await would be
        // armed at whatever point the event loop next came free, which during generation is
        // the thing being escaped from.
        void server.shutdown({ stayAlive: true });

        expect(released).toEqual(['raw mode', 'signal listeners']);
    });

    it('releases once, so a repeat request cannot run a release against a torn-down process', () => {
        let releases = 0;
        const server = shutdownServer();
        server.releaseOnShutdown(() => releases++);

        void server.shutdown({ stayAlive: true });
        void server.shutdown({ stayAlive: true });

        expect(releases).toBe(1);
    });

    it('tells the operator that a second interrupt exits', async () => {
        const lines: string[] = [];
        const server = shutdownServer({ logger: stub<Logger>({ info: (line: string) => lines.push(line) }) });

        await server.shutdown();

        expect(lines.join('')).toContain('interrupt again to exit immediately');
    });
});
