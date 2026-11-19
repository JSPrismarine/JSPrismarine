/**
 * A replay of a scripted session reaches the same digest (ADR 0006, ADR 0021).
 *
 * A server runs a behavior pack whose script sets the weather from `Math.random` and `Date`
 * every few ticks, and the weather is in each tick's replay digest. Run twice on the same seed
 * and the same admitted wall clock, the server reaches the same digest at every tick, however
 * differently the host's clock reads. Run on another seed, it does not, so the script's draws
 * do reach the digest. Every run has the script debugger set to listen when the scripts load,
 * and a replay never opens its port.
 */
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Logger } from '@jsprismarine/logger';
import { locateLibrary } from '@jsprismarine/script-host/library';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { Config } from '../config/Config';
import Server from '../Server';
import { stubRakNetListener } from '../testing/rakNetListener.test.helper';

stubRakNetListener();

/** Whether the script host library is built here, or CI asks for the test anyway. */
const scriptHostAvailable = (): boolean => {
    if (process.env.JSP_SCRIPT_HOST_REQUIRE === '1') return true;
    try {
        locateLibrary();
        return true;
    } catch {
        return false;
    }
};

const TICKS = 40;

/** A seeded linear congruential source, for the server's own draws. */
const seededRandom = (seed: number) => {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
        return state / 0x1_0000_0000;
    };
};

const SCRIPT = `
import { system, world, WeatherType } from '@minecraft/server';

const kinds = [WeatherType.Clear, WeatherType.Rain, WeatherType.Thunder];
system.runInterval(() => {
    const draw = Math.floor(Math.random() * kinds.length);
    const clock = Date.now() % kinds.length;
    world.getDimension('overworld').setWeather(kinds[(draw + clock) % kinds.length], 1000);
}, 3);
`;

const roots: string[] = [];
afterEach(() => {
    vi.unstubAllEnvs();
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** Each tick of a session: the world's replay digest and the weather the script left. */
interface SessionTicks {
    readonly digests: readonly string[];
    readonly weather: readonly string[];
    /** Whether the script debugger's port took a connection once the server had started. */
    readonly debuggerListened: boolean;
}

/** A port nothing listens on now, which the operating system picked. */
const freePort = async (): Promise<number> => {
    const server = createServer();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    server.close();
    await once(server, 'close');
    if (address === null || typeof address === 'string') throw new Error('no TCP address');
    return address.port;
};

/** Whether something accepts a connection on a loopback port. */
const accepts = (port: number): Promise<boolean> =>
    new Promise((resolve) => {
        const socket = createConnection({ host: '127.0.0.1', port });
        socket.once('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.once('error', () => resolve(false));
    });

/**
 * Runs a scripted server for {@link TICKS} ticks and returns each tick's world digest and weather.
 * @param seed - The world's seed, which the script's `Math.random` is seeded from.
 * @param wallClock - What each input step admits as the wall clock.
 * @param replay - Whether the server replays the session.
 */
const runSession = async (seed: string, wallClock: () => number, replay: boolean): Promise<SessionTicks> => {
    const debuggerPort = await freePort();
    const root = mkdtempSync(path.join(tmpdir(), 'jsprismarine-scripted-replay-'));
    roots.push(root);
    const pack = path.join(root, 'pack');
    mkdirSync(path.join(pack, 'scripts'), { recursive: true });
    writeFileSync(
        path.join(pack, 'manifest.json'),
        JSON.stringify({
            format_version: 2,
            header: { name: 'replayed', uuid: 'a4d1c5e2-3f6b-4c8d-9e0a-1b2c3d4e5f60', version: [1, 0, 0] },
            modules: [
                {
                    type: 'script',
                    uuid: 'b5e2d6f3-4a7c-4d9e-8f1b-2c3d4e5f6a71',
                    version: [1, 0, 0],
                    entry: 'scripts/main.js'
                }
            ],
            dependencies: [{ module_name: '@minecraft/server', version: '2.0.0' }]
        })
    );
    writeFileSync(path.join(pack, 'scripts', 'main.js'), SCRIPT);
    vi.stubEnv('JSP_DIR', root);
    writeFileSync(
        path.join(root, 'config.json'),
        JSON.stringify({
            'online-mode': false,
            'preload-radius': 0,
            'view-distance': 1,
            'enable-ticking': false,
            'chunk-workers': 0,
            'enable-query': false,
            'content-world-packs': [pack],
            'allow-inbound-script-debugging': true,
            'force-inbound-debug-port': debuggerPort,
            'script-debugger-auto-attach': 'listen',
            worlds: { world: { preset: 'minecraft:flat', provider: 'LevelDB', seed } }
        })
    );

    const server = new Server({ logger: new Logger('error'), config: new Config(), headless: true, wallClock, replay });
    // The server's own draws come from a seeded source, as the replay contract asks of a session.
    server.setRandom(seededRandom(Number(seed)));
    await server.bootstrap('127.0.0.1', 0);
    try {
        expect(server.getScripts()).toBeDefined();
        const debuggerListened = await accepts(debuggerPort);
        const world = server.getWorldManager().getDefaultWorld();
        const digests: string[] = [];
        const weather: string[] = [];
        for (let tick = 0; tick < TICKS; tick++) {
            server.advanceTick();
            digests.push(world.replayStateDigest());
            weather.push(world.getWeather());
        }
        return { digests, weather, debuggerListened };
    } finally {
        await server.shutdown({ stayAlive: true });
    }
};

describe.skipIf(!scriptHostAvailable())('a scripted session', { tags: ['real-data'] }, () => {
    let captured: Awaited<ReturnType<typeof runSession>>;
    let replay: Awaited<ReturnType<typeof runSession>>;
    let reseeded: Awaited<ReturnType<typeof runSession>>;

    // Each run boots a server, whose content build is the slow part, so the three run once, up front.
    beforeAll(async () => {
        // The capture reads a clock that moves on every read; the replay hands back the same readings.
        const admitted: number[] = [];
        let reads = 0;
        captured = await runSession(
            '1',
            () => {
                const now = 1_800_000_000_000 + reads++ * 37;
                admitted.push(now);
                return now;
            },
            false
        );
        const replaying = () => {
            let read = 0;
            return () => admitted[read++] ?? Number.NaN;
        };
        replay = await runSession('1', replaying(), true);
        reseeded = await runSession('2', replaying(), true);
    }, 180_000);

    it('replays to the same digest at every tick on the same seed and admitted clock, whatever the host clock', () => {
        // The script changed the weather, so the digests compare its work, not an idle world.
        expect(new Set(captured.weather).size).toBeGreaterThan(1);
        expect(replay.weather).toEqual(captured.weather);
        expect(replay.digests).toEqual(captured.digests);
        expect(reseeded.weather).not.toEqual(captured.weather);
        // The captured session listened for the debugger, as its config asked; the replays did not.
        expect([captured, replay, reseeded].map((run) => run.debuggerListened)).toEqual([true, false, false]);
    });
});
