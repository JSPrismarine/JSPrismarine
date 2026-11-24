import { createHash } from 'node:crypto';
import { once } from 'node:events';
import type { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ClientSocket from './ClientSocket';
import Frame from './protocol/Frame';
import { FrameReliability } from './protocol/FrameReliability';
import WorkerServerSocket from './WorkerServerSocket';
import ServerSocket from './ServerSocket';
import { ServerName } from './utils/ServerName';

const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    verbose: vi.fn(),
    debug: vi.fn(),
    silly: vi.fn()
};

const makeServerName = () =>
    new ServerName(
        {
            getConfig: () => ({ getMotd: () => 'worker test', getGamemode: () => 'survival', getMaxPlayers: () => 10 })
        },
        { protocolVersion: 2193, minecraftVersions: ['1.26.51'] }
    );

/**
 * Resolves once `predicate` holds, testing it now and again after each of `events` fires.
 *
 * The emitter calls its listeners in the order they were added, so the ones collecting what
 * `predicate` reads must be registered first. Nothing here gives up: a state that never
 * arrives is the test's own timeout to report.
 */
const until = (predicate: () => boolean, emitter: EventEmitter, ...events: string[]): Promise<void> => {
    const { promise, resolve } = Promise.withResolvers<void>();
    const check = () => {
        if (!predicate()) return;
        for (const event of events) emitter.off(event, check);
        resolve();
    };
    for (const event of events) emitter.on(event, check);
    check();
    return promise;
};

const makeFrame = (byte: number) => {
    const frame = new Frame();
    frame.reliability = FrameReliability.RELIABLE_ORDERED;
    frame.orderChannel = 0;
    frame.content = Buffer.from([0xfe, byte]);
    return frame;
};

describe('WorkerServerSocket', () => {
    let server: WorkerServerSocket | undefined;
    let client: ClientSocket | undefined;
    let pump: NodeJS.Timeout | undefined;

    afterEach(() => {
        clearInterval(pump);
        client?.kill();
        server?.kill();
        client = undefined;
        server = undefined;
        pump = undefined;
    });

    const start = async () => {
        server = new WorkerServerSocket(10, false, makeServerName(), logger, {}, 1024 * 1024);
        server.start('127.0.0.1', 0);
        await server.waitUntilReady();
        client = new ClientSocket(logger);
        const clientFrames: number[] = [];
        client.on('encapsulated', (frame: Frame) => clientFrames.push(frame.content[1]!));
        const clientSession = await client.connect('127.0.0.1', server.serverName.getPort());

        return { client, clientFrames, clientSession, server };
    };

    /**
     * Delivers the worker's events on every timer turn, as the game thread's tick does, until
     * {@link stopPump}.
     */
    const startPump = (target: WorkerServerSocket) => {
        clearInterval(pump);
        pump = setInterval(() => target.pollInbound(), 1);
    };
    const stopPump = () => {
        clearInterval(pump);
        pump = undefined;
    };

    /** Waits for the main thread to receive the worker's first connected session. */
    const firstSession = async (target: WorkerServerSocket) => {
        await until(() => target.getSessions().length === 1, target, 'openConnection');
        const session = target.getSessions()[0];
        if (!session) throw new Error('connected worker session was not handed to the main thread');
        return session;
    };

    it('preserves reliable order in both directions through the shared rings', async () => {
        const { client, clientSession, clientFrames, server } = await start();
        const serverFrames: number[] = [];
        server.on('encapsulated', (frame: Frame) => serverFrames.push(frame.content[1]!));
        startPump(server);
        const serverSession = await firstSession(server);

        for (let value = 0; value < 8; value++) clientSession.sendFrame(makeFrame(value));
        clientSession.sendFrameQueue();
        await until(() => serverFrames.length === 8, server, 'encapsulated');

        for (let value = 20; value < 28; value++) serverSession.sendFrame(makeFrame(value));
        await until(() => clientFrames.length === 8, client, 'encapsulated');

        expect(serverFrames).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
        expect(clientFrames).toEqual([20, 21, 22, 23, 24, 25, 26, 27]);
    });

    it('matches socket-mode per-session payload digests and connection order', async () => {
        const capture = async (useWorker: boolean) => {
            const name = makeServerName();
            const worker = useWorker ? new WorkerServerSocket(10, false, name, logger, {}, 1024 * 1024) : undefined;
            const listener = worker ?? new ServerSocket(10, false, name, logger);
            const clients: ClientSocket[] = [];
            const sessionsByAddress = new Map<string, number>();
            const received: string[][] = [[], []];
            let nextSession = 0;
            listener.on('openConnection', (session) => {
                sessionsByAddress.set(session.getAddress().toToken(), nextSession++);
            });
            listener.on('encapsulated', (frame, address) => {
                const index = sessionsByAddress.get(address.toToken());
                if (index === undefined) return;
                received[index]!.push(createHash('sha256').update(frame.content).digest('hex'));
            });

            if (worker) {
                worker.start('127.0.0.1', 0);
                await worker.waitUntilReady();
            } else {
                const listening = once(listener, 'listening');
                listener.start('127.0.0.1', 0);
                await listening;
            }
            const poll = worker ? setInterval(() => worker.pollInbound(), 1) : undefined;

            try {
                const clientSessions = [];
                for (let id = 0; id < 2; id++) {
                    const client = new ClientSocket(logger);
                    clients.push(client);
                    clientSessions.push(await client.connect('127.0.0.1', name.getPort()));
                    await until(() => nextSession > id, listener, 'openConnection');
                }

                for (let id = 0; id < clientSessions.length; id++) {
                    const session = clientSessions[id]!;
                    for (let sequence = 0; sequence < 12; sequence++) {
                        const frame = new Frame();
                        frame.reliability = FrameReliability.RELIABLE_ORDERED;
                        frame.orderChannel = 0;
                        frame.content = Buffer.from([0xfe, id, sequence]);
                        session.sendFrame(frame);
                    }
                    session.sendFrameQueue();
                }

                await until(() => received.every((digests) => digests.length === 12), listener, 'encapsulated');
                return received;
            } finally {
                clearInterval(poll);
                for (const client of clients) client.kill();
                listener.kill();
            }
        };

        const socketDigests = await capture(false);
        const workerDigests = await capture(true);
        expect(workerDigests).toEqual(socketDigests);
    });

    it('keeps ACK and retransmission work moving while the game-thread handoff waits', async () => {
        const { client, clientSession, clientFrames, server } = await start();
        const received: number[] = [];
        server.on('encapsulated', (frame: Frame) => received.push(frame.content[1]!));
        startPump(server);
        const serverSession = await firstSession(server);

        // From here the game thread is held up: nothing polls the inbound ring until the
        // worker has shown it kept sending frames and handling reliability feedback alone.
        stopPump();
        const samplesBefore = server.getMetrics().roundTripSamples;

        for (let value = 0; value < 40; value++) clientSession.sendFrame(makeFrame(value));
        clientSession.sendFrameQueue();
        for (let value = 40; value < 48; value++) serverSession.sendFrame(makeFrame(value));

        // The client socket still handles UDP, so the worker's frames reach it.
        await until(() => clientFrames.length === 8, client, 'encapsulated');
        expect(clientFrames).toHaveLength(8);

        // The client timer is independent of the worker under test. Drive its ACK pass after
        // observing delivery so a loaded test runner cannot starve that unrelated timer.
        clientSession.update();
        // The worker measures a round trip from that acknowledgment with the handoff still
        // blocked, which is the proof that it processed ACKs on its own.
        await server.waitForRoundTripSamples(samplesBefore + 1);
        const metrics = server.getMetrics();

        // The client's 40 frames went out ahead of its acknowledgment, so they are waiting in
        // the ring for the game thread.
        expect(metrics.inbound.queuedBytes).toBeGreaterThan(0);
        expect(metrics.roundTripSamples).toBeGreaterThan(samplesBefore);
        expect(metrics.retransmissions).toBe(0);
        expect(received).toEqual([]);

        startPump(server);
        await until(() => received.length === 40, server, 'encapsulated');
        expect(clientFrames).toHaveLength(8);
        expect(received).toEqual(Array.from({ length: 40 }, (_, index) => index));
    });

    it("hands the main thread's session the worker's round trip time once it has a sample", async () => {
        const { client, clientSession, clientFrames, server } = await start();
        startPump(server);
        const serverSession = await firstSession(server);
        // The client's own timer may acknowledge the handshake before this line, so the RTT is
        // checked only after a frame the test makes the client acknowledge.

        serverSession.sendFrame(makeFrame(1));
        await until(() => clientFrames.length === 1, client, 'encapsulated');
        // Drive the client's ACK pass, as its own timer would.
        clientSession.update();
        await server.waitForRoundTripSamples(1);
        // The worker wrote the round trip event before counting the sample; deliver it now
        // rather than on the pump's next turn.
        while (server.pollInbound() > 0);

        expect(serverSession.getRTT()).not.toBeNull();
        expect(serverSession.getRTT()).toBeGreaterThanOrEqual(0);
    });

    it('rejects a frame larger than the bounded producer queue', async () => {
        server = new WorkerServerSocket(10, false, makeServerName(), logger, {}, 64);
        server.start('127.0.0.1', 0);
        await server.waitUntilReady();
        client = new ClientSocket(logger);
        await client.connect('127.0.0.1', server.serverName.getPort());
        startPump(server);
        const session = await firstSession(server);

        const oversized = makeFrame(4);
        oversized.content = Buffer.alloc(64);
        expect(() => session.sendFrame(oversized)).toThrow(/worker queue is full/);
        expect(server.getMetrics().outbound.fullWrites).toBe(1);
    });

    it('reports a port another socket holds as an error and a rejected start', async () => {
        server = new WorkerServerSocket(10, false, makeServerName(), logger, {}, 1024 * 1024);
        server.start('127.0.0.1', 0);
        await server.waitUntilReady();
        const port = server.serverName.getPort();

        const loser = new WorkerServerSocket(10, false, makeServerName(), logger, {}, 1024 * 1024);
        const errors: Error[] = [];
        loser.on('error', (error) => errors.push(error));
        loser.start('127.0.0.1', port);

        await expect(loser.waitUntilReady()).rejects.toThrow('EADDRINUSE');
        expect(errors).toHaveLength(1);
        loser.kill();
    });

    it('fails a start nobody awaits through error alone, not an unhandled rejection', async () => {
        server = new WorkerServerSocket(10, false, makeServerName(), logger, {}, 1024 * 1024);
        server.start('127.0.0.1', 0);
        await server.waitUntilReady();

        // Never asked for readiness, as the server's networking never asks.
        const loser = new WorkerServerSocket(10, false, makeServerName(), logger, {}, 1024 * 1024);
        const failed = new Promise<Error>((resolve) => loser.on('error', resolve));
        loser.start('127.0.0.1', server.serverName.getPort());

        expect((await failed).message).toContain('EADDRINUSE');
        // Let a rejection nobody handles reach the process, where Vitest fails the run on it.
        // Node reports unhandled rejections once the task that made them has run its
        // microtasks, so the next turn of the event loop comes after that report.
        await new Promise<void>((resolve) => setImmediate(resolve));
        loser.kill();
    });

    it('emits session closes when the worker listener is killed', async () => {
        const { server } = await start();
        const closed: string[] = [];
        server.on('closeConnection', (_address, reason) => closed.push(reason));
        startPump(server);
        await firstSession(server);

        server.kill();

        expect(closed).toEqual(['server closed']);
        expect(server.serverName.getOnlinePlayerCount()).toBe(0);
    });
});
