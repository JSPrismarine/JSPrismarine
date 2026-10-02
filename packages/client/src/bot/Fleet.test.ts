import { Logger } from '@jsprismarine/logger';
import { Config, Server } from '@jsprismarine/prismarine';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import Fleet from './Fleet';
import { formatReport } from './Metrics';
import { createBehaviours } from './behaviour/Behaviours';

/**
 * The harness against a real server, which is the only way to know it generates load rather
 * than merely appearing to: every packet these bots send is decoded by the real handlers,
 * and a bot that mis-encodes its position produces numbers that mean nothing.
 */

let stateRoot: string;
let server: Server | null = null;
const port = 19278;
const fleets: Fleet[] = [];

beforeAll(async () => {
    stateRoot = mkdtempSync(path.join(tmpdir(), 'jsprismarine-fleet-'));
    vi.stubEnv('JSP_DIR', stateRoot);

    server = new Server({ logger: new Logger('error'), config: new Config(), headless: true });
    await server.bootstrap('127.0.0.1', port);
}, 60_000);

afterEach(() => {
    fleets.splice(0).forEach((fleet) => fleet.stop());
});

afterAll(() => {
    server?.getRaknet()?.kill();
    vi.unstubAllEnvs();
    rmSync(stateRoot, { recursive: true, force: true });
}, 30_000);

const newFleet = (options: Partial<ConstructorParameters<typeof Fleet>[0]> & { namePrefix: string }) => {
    const fleet = new Fleet({
        host: '127.0.0.1',
        port,
        count: 4,
        seed: 1234,
        // No spacing: four bots is not a thundering herd, and waiting a tenth of a second
        // each would be most of the test's runtime.
        ramp: 0,
        viewDistance: 2,
        logger: new Logger('error'),
        loginTimeoutMs: 20_000,
        ...options
    });

    fleets.push(fleet);
    return fleet;
};

describe('a fleet against a real server', () => {
    it('connects every bot and the server sees all of them', async () => {
        const fleet = newFleet({ namePrefix: 'Connect' });
        await fleet.connect();

        const report = fleet.report();
        expect(report.connected).toBe(4);
        expect(report.failed).toBe(0);
        expect(report.failures).toEqual([]);

        const names = server!
            .getSessionManager()
            .getAllPlayers()
            .map((player: any) => player.getName());
        expect(names).toEqual(expect.arrayContaining(['Connect0', 'Connect1', 'Connect2', 'Connect3']));
    }, 60_000);

    it('measures a login latency for every bot that got in', async () => {
        const fleet = newFleet({ namePrefix: 'Latency' });
        await fleet.connect();

        const { loginLatencyMs } = fleet.report();
        expect(loginLatencyMs.count).toBe(4);
        expect(loginLatencyMs.p50).toBeGreaterThan(0);
        // Ordering the percentiles imply, which is what catches a summary built from an
        // unsorted list.
        expect(loginLatencyMs.p99!).toBeGreaterThanOrEqual(loginLatencyMs.p50!);
        expect(loginLatencyMs.max!).toBeGreaterThanOrEqual(loginLatencyMs.p99!);
    }, 60_000);

    it('actually walks and chats, and the server keeps them connected while it happens', async () => {
        const fleet = newFleet({ namePrefix: 'Active', behaviours: ['walk', 'look'] });
        await fleet.connect();
        await fleet.run(1_500);

        const report = fleet.report();

        // The packets went somewhere: every one was decoded by the real MovePlayerHandler,
        // so a mis-encoded position would have shown up as a decode error rather than as a
        // count.
        expect(report.actions.move).toBeGreaterThan(0);
        expect(report.actions.look).toBeGreaterThan(0);
        expect(report.traffic.packetsSent).toBeGreaterThan(report.connected);
        expect(report.traffic.bytesReceived).toBeGreaterThan(0);
    }, 60_000);

    it('moves the bots somewhere, rather than reporting moves it never made', async () => {
        const fleet = newFleet({ namePrefix: 'Moved', behaviours: ['walk'] });
        await fleet.connect();

        const before = fleet.getBots().map((bot) => ({ ...bot.position }));
        await fleet.run(1_000);
        const after = fleet.getBots().map((bot) => ({ ...bot.position }));

        expect(after.some((position, index) => position.x !== before[index]!.x)).toBe(true);
    }, 60_000);

    it('breaks blocks without the connection objecting', async () => {
        // PlayerAction is the packet with the unsigned-y block position, which is the one
        // easiest to get subtly wrong: a bad encoding is decoded as a different action at a
        // different place, and nothing complains.
        const fleet = newFleet({ namePrefix: 'Breaker', behaviours: ['break'] });
        await fleet.connect();

        // Slept through rather than `run`, which stops the fleet when it returns - the point
        // here is that the connections are still up *while* the breaking happens.
        await new Promise((resolve) => setTimeout(resolve, 2_500));

        expect(fleet.report().actions.break).toBeGreaterThan(0);
        expect(fleet.getConnectedBots()).toHaveLength(4);
    }, 60_000);

    it('reports a refusal instead of throwing the whole run away', async () => {
        // A fleet that gives up on the first rejection cannot answer "how many of five
        // hundred got in", which is usually the question.
        const fleet = newFleet({ namePrefix: 'Unreachable', count: 2, loginTimeoutMs: 400 });
        (fleet as any).options = { ...(fleet as any).options };
        for (const bot of fleet.getBots()) {
            vi.spyOn(bot.getClient(), 'connect').mockRejectedValue(new Error('Connection refused: the server is full'));
        }

        await fleet.connect();

        const report = fleet.report();
        expect(report.connected).toBe(0);
        expect(report.failed).toBe(2);
        expect(report.failures).toEqual([{ reason: 'Connection refused: the server is full', count: 2 }]);
    }, 60_000);

    it('renders a report a human can read', async () => {
        const fleet = newFleet({ namePrefix: 'Printed', behaviours: ['walk'] });
        await fleet.connect();
        await fleet.run(600);

        const text = formatReport(fleet.report());
        expect(text).toContain('seed 1234');
        expect(text).toContain('connected  4/4');
        expect(text).toMatch(/login {6}p50/);
    }, 60_000);
});

describe('behaviour selection', () => {
    it('refuses a name it does not know rather than running a quieter fleet', () => {
        // A load test silently missing half its traffic is worse than one that will not start.
        expect(() => createBehaviours(['walk', 'teleport'])).toThrow(/Unknown behaviour "teleport"/);
    });

    it('builds a fresh instance per call, so bots do not share behaviour state', () => {
        const [first] = createBehaviours(['walk']);
        const [second] = createBehaviours(['walk']);

        expect(first).not.toBe(second);
    });
});
