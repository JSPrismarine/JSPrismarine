import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Logger } from '@jsprismarine/logger';

import Server from './Server';
import type SessionManager from './SessionManager';
import type { Networking } from './modules/network';
import type { ServerTicker } from './modules/ticker';
import { ShutdownLifecycle } from './ShutdownLifecycle';
import type PlayerSession from './network/PlayerSession';
import type { World } from './world/World';
import { WorldMessages } from './world/WorldMessages';
import { stub } from './testing/stub.test.helper';

/** A lifecycle in the state a running shutdown leaves it: the next request is a force exit. */
const alreadyStopping = (): ShutdownLifecycle => {
    const lifecycle = new ShutdownLifecycle();
    lifecycle.beginShutdown();
    return lifecycle;
};

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
        lifecycle: new ShutdownLifecycle(),
        console: undefined,
        networking: stub<Networking>({ admitInputs: () => 0, kill: () => {} }),
        worldMessages: new WorldMessages(() => {}),
        sessionManager: stub<SessionManager>({ getSessions: () => [] }),
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
        const server = shutdownServer({ lifecycle: alreadyStopping() });

        void server.shutdown();

        expect(exit).toHaveBeenCalledWith(1);
    });

    it('says the exit is being forced, on stderr rather than through the logger', () => {
        const server = shutdownServer({ lifecycle: alreadyStopping() });

        void server.shutdown();

        expect(written.join('')).toContain('Forcing exit');
    });

    it('leaves a `stayAlive` caller alone, so a second /stop does not kill the process', () => {
        const server = shutdownServer({ lifecycle: alreadyStopping() });

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

    it('applies the last inputs and the world messages they filed before it kicks anyone', async () => {
        const order: string[] = [];
        const worldMessages = new WorldMessages(() => {});
        const world = stub<World>({ runInputNow: (apply) => apply() });
        const server = shutdownServer({
            worldMessages,
            networking: stub<Networking>({
                // A last input that changes a player in another world, as `SetDefaultGameType` does.
                admitInputs: () => {
                    order.push('inputs');
                    worldMessages.send(world, () => void order.push('message'));
                    return 1;
                },
                kill: () => {}
            }),
            sessionManager: stub<SessionManager>({
                getSessions: () => [stub<PlayerSession>({ kick: async () => void order.push('kick') })]
            })
        });

        await server.shutdown({ stayAlive: true });

        expect(order).toEqual(['inputs', 'message', 'kick']);
    });

    it('applies a message that files itself again for another world before it kicks anyone', async () => {
        const order: string[] = [];
        const worldMessages = new WorldMessages(() => {});
        const world = stub<World>({ runInputNow: (apply) => apply() });
        const server = shutdownServer({
            worldMessages,
            networking: stub<Networking>({
                // A default game type for a player who changed world in the same inputs: the
                // message finds them gone from its world and files itself for the one they are in.
                admitInputs: () => {
                    worldMessages.send(world, () => {
                        order.push('filed again');
                        worldMessages.send(world, () => void order.push('applied'));
                    });
                    return 1;
                },
                kill: () => {}
            }),
            sessionManager: stub<SessionManager>({
                getSessions: () => [stub<PlayerSession>({ kick: async () => void order.push('kick') })]
            })
        });

        await server.shutdown({ stayAlive: true });

        expect(order).toEqual(['filed again', 'applied', 'kick']);
    });

    it('tells the operator that a second interrupt exits', async () => {
        const lines: string[] = [];
        const server = shutdownServer({ logger: stub<Logger>({ info: (line: string) => lines.push(line) }) });

        await server.shutdown();

        expect(lines.join('')).toContain('interrupt again to exit immediately');
    });
});
