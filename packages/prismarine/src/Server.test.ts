// @module-tag integration

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { memoryLinkPair } from '@jsprismarine/console-protocol';
import type { ConsoleMessage, ServerMessage } from '@jsprismarine/console-protocol';
import { Logger } from '@jsprismarine/logger';
import Server from './Server';
import type { ProtocolProvider } from './protocolProviders';
import { bedrockProtocolProvider, describeProtocolProviders, javaProtocolProvider } from './protocolProviders';
import { Config } from './config/Config';
import { RemoteConsole } from './console/RemoteConsole';
import { RemoteLogTransport } from './console/RemoteLogTransport';
import ChunkSender from './player/ChunkSender';
import type { Transport } from './network/transport/Transport';
import { statsToken } from './modules/tokens';
import { ServerMetric } from './stats/serverMetrics';
import type { StatsProvider } from './stats/StatsProvider';
import { stubRakNetListener } from './testing/rakNetListener.test.helper';
import { GenerationStopped } from './world/Generator';

stubRakNetListener();

describe('Server', () => {
    let worldRoot: string;

    beforeAll(() => {
        // This used to configure no world at all, which only booted because a missing
        // default world was warned about and shrugged off - leaving `getEntryWorld()`
        // undefined and every caller asserting it away. It now fails at startup instead, so
        // the smoke test loads a real world. Pointed at a temp directory via `JSP_DIR` so
        // the run writes nothing into the repository.
        worldRoot = mkdtempSync(path.join(tmpdir(), 'jsprismarine-server-test-'));
        vi.stubEnv('JSP_DIR', worldRoot);
    });

    afterAll(() => {
        vi.unstubAllEnvs();
        rmSync(worldRoot, { recursive: true, force: true });
    });

    /**
     * A config naming a world of its own.
     *
     * Extends the real `Config` because its fields are private, so nothing else can stand in
     * for it. `enable` is a no-op so the file under `JSP_DIR` is never read; every value the
     * server asks for at startup is answered by an override below.
     *
     * One folder per test keeps each startup independent. LevelDB takes a directory lock, so
     * two servers must not open the same world at once.
     */
    const debugConfig = (
        levelName: string,
        options: { ticking?: boolean; processTitle?: boolean; java?: boolean; javaPort?: number } = {}
    ) =>
        new (class DebugConfig extends Config {
            public override async enable() {}

            public override getJavaEnabled() {
                return options.java ?? false;
            }

            public override getJavaPort() {
                return options.javaPort ?? super.getJavaPort();
            }

            public override getServerIp() {
                return '0.0.0.0';
            }

            public override getLevelName() {
                return levelName;
            }

            public override getWorlds() {
                return {
                    [levelName]: { preset: 'minecraft:flat', provider: 'LevelDB', seed: 1 }
                };
            }

            /** Zero: this is a startup smoke test, not a terrain generation one. */
            public override getPreloadRadius() {
                return 0;
            }

            public override getChunkSendBudgetMs() {
                return 5;
            }

            public override getMaxPlayers() {
                return 1;
            }

            public override getGamemode() {
                return 'creative';
            }

            public override getMotd() {
                return 'CI';
            }

            public override getViewDistance() {
                return 4;
            }

            public override getOnlineMode() {
                return false;
            }

            /**
             * The listener on this thread, which `stubRakNetListener` replaces, so no test binds a
             * socket. The worker listener would bind a real one, on a port another run may hold.
             */
            public override getUseRakNetWorker() {
                return false;
            }

            public override getEnableTicking() {
                return options.ticking ?? false;
            }

            public override getEnableProcessTitle() {
                return options.processTitle ?? false;
            }

            public override getPacketCompressionLevel() {
                return 7;
            }
        })();

    it("announces each edition it speaks: Bedrock, Java once it is on, then the embedder's", async () => {
        const banners: string[] = [];
        const custom: ProtocolProvider = {
            edition: 'Pocket Edition',
            protocols: () => [{ protocolVersion: 8, minecraftVersions: ['8.0'], advertised: true, preview: false }]
        };
        for (const java of [false, true]) {
            const logger = new Logger();
            const lines: string[] = [];
            vi.spyOn(logger, 'info').mockImplementation((message) => void lines.push(String(message)));
            const server = new Server({
                logger,
                config: debugConfig(`test-world-banner-${java}`, { java }),
                protocolProviders: [custom]
            });
            banners.push(lines.join('\n'));
            expect(server.getProtocolProviders()).toEqual(
                java ? [bedrockProtocolProvider, javaProtocolProvider, custom] : [bedrockProtocolProvider, custom]
            );
        }

        const [bedrockOnly, withJava] = banners;
        for (const edition of describeProtocolProviders([bedrockProtocolProvider, custom], true)) {
            expect(bedrockOnly).toContain(edition);
        }
        expect(bedrockOnly).not.toContain('Java Edition');
        expect(withJava).toContain(describeProtocolProviders([javaProtocolProvider], true)[0]);
    });

    it.each([
        { java: false, expected: (line: string) => expect(line).not.toContain('Java Edition') },
        { java: true, expected: (line: string) => expect(line).toContain('Java Edition on port') }
    ])(
        'names the Java Edition port in its listening line only when Java is on (java: $java)',
        async ({ java, expected }) => {
            const logger = new Logger();
            const listening: string[] = [];
            logger.onLine((line) => {
                if (line.includes('is now listening on port')) listening.push(line);
            });
            // Port 0 binds an ephemeral port, so the Java listener holds none of the machine's.
            const server = new Server({
                logger,
                config: debugConfig(`test-world-listening-${java}`, { java, javaPort: 0 })
            });
            await server.bootstrap('127.0.0.1', 0);
            await server.shutdown({ stayAlive: true });

            expect(listening).toHaveLength(1);
            expected(listening[0] ?? '');
        }
    );

    it('reports a failed chunk send but not one a stopped generator refused', async () => {
        const logger = new Logger();
        const warnings: string[] = [];
        const errors: unknown[] = [];
        vi.spyOn(logger, 'warn').mockImplementation((message) => void warnings.push(String(message)));
        vi.spyOn(logger, 'error').mockImplementation((error) => void errors.push(error));
        const server = new Server({ logger, config: debugConfig('test-world-chunk-failures') });

        const sender = new ChunkSender();
        sender.enqueue(3, 66);
        sender.enqueue(4, 66);
        const broken = new Error('the region file is unreadable');
        const scheduler = server.getChunkScheduler();
        scheduler.add({
            sender,
            deliver: async (x, z) => {
                throw x === 3 ? new GenerationStopped(x, z) : broken;
            },
            flush: async () => {},
            isConnected: () => true
        });
        await scheduler.tick();
        await scheduler.close();

        expect(warnings.filter((message) => message.startsWith('Failed to send chunk'))).toEqual([
            'Failed to send chunk §b4, 66§r: the region file is unreadable'
        ]);
        expect(errors).toEqual([broken]);
    });

    // `packages/console/src/testing/stubServer.test-utils.ts` replays this order to test the
    // console without a server. Change the stub's `STARTUP` script when this test changes.
    it('greets, steps through startup and reports running, answering a command list request at any point', async () => {
        const server = new Server({ logger: new Logger(), config: debugConfig('test-world-boot') });
        const [serverEnd, consoleEnd] = memoryLinkPair<ConsoleMessage, ServerMessage>();
        const received: ServerMessage[] = [];
        const answers: (readonly string[])[] = [];
        consoleEnd.onMessage((message) => {
            received.push(message);
            // The console asks for the command list as soon as the server says hello.
            if (message.type === 'hello') consoleEnd.send({ type: 'commands', v: 1, id: 'early' });
            if (message.type === 'commands.result') answers.push(message.commands.map(({ name }) => name));
        });
        server.attachRemoteConsole(new RemoteConsole(server, serverEnd, new RemoteLogTransport(serverEnd)));

        await server.bootstrap('127.0.0.1', 0);
        consoleEnd.send({ type: 'commands', v: 1, id: 'late' });
        await new Promise<void>((resolve) => queueMicrotask(resolve));
        await server.shutdown({ stayAlive: true });

        const order = received
            .filter((message) => message.type !== 'log' && message.type !== 'status')
            .map((message) => (message.type === 'lifecycle' ? `lifecycle ${message.state}` : message.type));
        const running = order.indexOf('lifecycle running');
        expect(order.slice(0, 2)).toEqual(['hello', 'lifecycle starting']);
        expect(order.slice(2, running).every((type) => type === 'boot' || type === 'commands.result')).toBe(true);
        expect(order.slice(running + 1, running + 2)).toEqual(['commands.result']);
        // Every step that begins finishes, and the next one starts only after.
        const steps = received.flatMap((message) => (message.type === 'boot' ? [message] : []));
        expect(steps.length).toBeGreaterThan(0);
        for (let index = 0; index < steps.length; index += 2) {
            expect(steps[index]).toMatchObject({ state: 'starting' });
            expect(steps[index + 1]).toMatchObject({ step: steps[index]?.step, state: 'started' });
        }
        // Both requests get an answer. Over a real process channel the early one can arrive
        // long after it was sent, since startup keeps the event loop busy, so the console must
        // not take its absence to mean the server has no commands.
        expect(answers).toHaveLength(2);
        expect(answers[1]).toContain('stop');
    });

    it('starts and stops without crashing, starting and stopping an embedder stats provider', async () => {
        const logger = new Logger();
        const calls: string[] = [];
        const provider: StatsProvider = {
            id: 'embedder',
            start: ({ registry }) => void calls.push(`start with ${registry.snapshot().metrics.size} metrics`),
            stop: () => void calls.push('stop')
        };
        const prismarine = new Server({
            logger,
            config: debugConfig('test-world'),
            statsProviders: [provider]
        });

        await prismarine.bootstrap('127.0.0.1', 0);
        expect(calls).toEqual([`start with ${Object.values(ServerMetric).length} metrics`]);
        await expect(prismarine.shutdown({ stayAlive: true })).resolves.toBe(true);
        expect(calls.at(-1)).toBe('stop');
    });

    it('registers every server metric in the registry its kernel provides', async () => {
        const config = debugConfig('test-world-stats');
        const prismarine = new Server({ logger: new Logger('error'), config });
        await prismarine.getKernel().registerAll();
        const registry = prismarine.getKernel().get(statsToken);

        const names = Object.values(ServerMetric);
        expect([...registry.snapshot().metrics.keys()]).toEqual(names);
        for (const name of names) expect(registry.read(name), name).toBeDefined();
    });

    it('measures how long its ticks take once it is ticking', { tags: ['performance'] }, async () => {
        const prismarine = new Server({
            logger: new Logger(),
            config: debugConfig('test-world-ticking', { ticking: true })
        });
        // No tick has run yet, so there is nothing to report.
        expect(prismarine.getTickMs()).toBe(0);

        await prismarine.bootstrap('127.0.0.1', 0);
        await new Promise((resolve) => setTimeout(resolve, 200));
        try {
            const tickMs = prismarine.getTickMs();
            expect(tickMs).toBeGreaterThan(0);
            // An idle flat world with no chunks loaded does not take a whole tick period.
            expect(tickMs).toBeLessThan(50);
        } finally {
            await prismarine.shutdown({ stayAlive: true });
        }
    });

    it('refreshes the process title every five seconds', { tags: ['performance'] }, async () => {
        const descriptor = Object.getOwnPropertyDescriptor(process, 'title');
        if (descriptor === undefined) throw new Error('process.title has no property descriptor');
        let title = process.title;
        const writes: string[] = [];
        Object.defineProperty(process, 'title', {
            configurable: true,
            enumerable: descriptor.enumerable,
            get: () => title,
            set: (next: string) => {
                title = next;
                writes.push(next);
            }
        });

        const prismarine = new Server({
            logger: new Logger(),
            config: debugConfig('test-world-process-title', { ticking: true, processTitle: true })
        });
        let bootstrapped = false;
        try {
            await prismarine.bootstrap('127.0.0.1', 0);
            bootstrapped = true;
            await new Promise((resolve) => setTimeout(resolve, 4500));
            expect(writes.length).toBeLessThanOrEqual(1);

            await new Promise((resolve) => setTimeout(resolve, 1000));
            expect(writes.length).toBeGreaterThanOrEqual(1);
            expect(writes.length).toBeLessThanOrEqual(2);
        } finally {
            try {
                if (bootstrapped) await prismarine.shutdown({ stayAlive: true });
            } finally {
                Object.defineProperty(process, 'title', descriptor);
            }
        }
    });

    it('listens on the transport it was given and binds no listener of its own', async () => {
        const subscribed: string[] = [];
        let closed = false;
        const transport: Transport = {
            onConnect: () => void subscribed.push('connect'),
            onDisconnect: () => void subscribed.push('disconnect'),
            onFrame: () => void subscribed.push('frame'),
            close: () => {
                closed = true;
            }
        };
        const prismarine = new Server({
            logger: new Logger(),
            config: debugConfig('test-world-transport'),
            headless: true,
            transport
        });

        await prismarine.bootstrap('0.0.0.0', 0);
        try {
            expect(new Set(subscribed)).toEqual(new Set(['connect', 'disconnect', 'frame']));
            expect(prismarine.getRaknet()).toBeUndefined();
            // The config enables RakNet and NetherNet, but neither started.
            expect(prismarine.getKernel().get(statsToken).read(ServerMetric.transports)?.value).toEqual([]);
        } finally {
            await prismarine.shutdown({ stayAlive: true });
        }
        expect(closed).toBe(true);
    });

    it('starts and stops without crashing in headless mode', async () => {
        const logger = new Logger();
        const prismarine = new Server({
            logger,
            config: debugConfig('test-world-headless'),
            headless: true
        });

        await prismarine.bootstrap('127.0.0.1', 0);
        await expect(prismarine.shutdown({ stayAlive: true })).resolves.toBe(true);
    });
});
