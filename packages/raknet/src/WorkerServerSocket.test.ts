import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
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

        return { clientFrames, clientSession, server };
    };

    const waitFor = async (predicate: () => boolean, timeoutMs = 3000): Promise<void> => {
        const deadline = Date.now() + timeoutMs;
        while (!predicate()) {
            server?.pollInbound();
            if (Date.now() >= deadline) throw new Error('worker RakNet condition timed out');
            await delay(2);
        }
    };

    it('preserves reliable order in both directions through the shared rings', async () => {
        const { clientSession, clientFrames, server } = await start();
        const serverFrames: number[] = [];
        server.on('encapsulated', (frame: Frame) => serverFrames.push(frame.content[1]!));
        await waitFor(() => server.getSessions().length === 1);
        const serverSession = server.getSessions()[0];
        if (!serverSession) throw new Error('connected worker session was not handed to the main thread');

        for (let value = 0; value < 8; value++) clientSession.sendFrame(makeFrame(value));
        clientSession.sendFrameQueue();
        await waitFor(() => serverFrames.length === 8);

        for (let value = 20; value < 28; value++) serverSession.sendFrame(makeFrame(value));
        await waitFor(() => clientFrames.length === 8);

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
                    const deadline = Date.now() + 3000;
                    while (nextSession <= id) {
                        if (Date.now() >= deadline) throw new Error('server did not accept parity-test client');
                        worker?.pollInbound();
                        await delay(2);
                    }
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

                const deadline = Date.now() + 3000;
                while (received.some((digests) => digests.length !== 12)) {
                    if (Date.now() >= deadline) throw new Error('parity-test frames did not arrive');
                    worker?.pollInbound();
                    await delay(2);
                }
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
        const { clientSession, clientFrames, server } = await start();
        const received: number[] = [];
        server.on('encapsulated', (frame: Frame) => received.push(frame.content[1]!));
        await waitFor(() => server.getSessions().length === 1);
        const serverSession = server.getSessions()[0];
        if (!serverSession) throw new Error('connected worker session was not handed to the main thread');

        for (let value = 0; value < 40; value++) clientSession.sendFrame(makeFrame(value));
        clientSession.sendFrameQueue();
        for (let value = 40; value < 48; value++) serverSession.sendFrame(makeFrame(value));

        // This is the game-thread handoff interval. The client socket still handles UDP, while
        // the worker continues ACKs, reliability updates, and the bounded inbound queue.
        await delay(250);
        let metrics = server.getMetrics();
        const frameDeadline = Date.now() + 5_000;
        // Don't poll the inbound ring here: the game-thread handoff must stay blocked while
        // the worker sends frames and handles reliability feedback.
        while (clientFrames.length < 8 && Date.now() < frameDeadline) {
            await delay(2);
            metrics = server.getMetrics();
        }
        expect(clientFrames).toHaveLength(8);

        // The client timer is independent of the worker under test. Drive its ACK pass after
        // observing delivery so a loaded test runner cannot starve that unrelated timer.
        clientSession.update();
        const sampleDeadline = Date.now() + 5_000;
        while (metrics.roundTripSamples === 0 && Date.now() < sampleDeadline) {
            await delay(2);
            metrics = server.getMetrics();
        }

        expect(metrics.inbound.queuedBytes).toBeGreaterThan(0);
        // The RTT clock starts when frames are sent, before the handoff wait. Comparing that full
        // RTT to the later wait duration includes unrelated setup time and flakes under load.
        // A sample before pollInbound is the deterministic proof that the worker processed ACKs.
        expect(metrics.roundTripSamples).toBeGreaterThan(0);
        expect(metrics.retransmissions).toBe(0);

        server.pollInbound();
        await waitFor(() => received.length === 40);
        await waitFor(() => clientFrames.length === 8);
        expect(received).toEqual(Array.from({ length: 40 }, (_, index) => index));
    });

    it('rejects a frame larger than the bounded producer queue', async () => {
        server = new WorkerServerSocket(10, false, makeServerName(), logger, {}, 64);
        server.start('127.0.0.1', 0);
        await server.waitUntilReady();
        client = new ClientSocket(logger);
        await client.connect('127.0.0.1', server.serverName.getPort());
        await waitFor(() => server?.getSessions().length === 1);
        const session = server.getSessions()[0];
        if (!session) throw new Error('connected worker session was not handed to the main thread');

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
        await delay(50);
        loser.kill();
    });

    it('emits session closes when the worker listener is killed', async () => {
        const { server } = await start();
        const closed: string[] = [];
        server.on('closeConnection', (_address, reason) => closed.push(reason));
        await waitFor(() => server.getSessions().length === 1);

        server.kill();

        expect(closed).toEqual(['server closed']);
        expect(server.serverName.getOnlinePlayerCount()).toBe(0);
    });
});
