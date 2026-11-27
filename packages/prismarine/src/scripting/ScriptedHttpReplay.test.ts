// @module-tag integration

/**
 * A replay of a session whose scripts use `@minecraft/server-net` reaches the same digest without
 * the network (ADR 0006, ADR 0009, ADR 0021).
 *
 * A behavior pack sends a request every few ticks and sets the weather from how it ended. The
 * captured session's transport answers each request a varying number of ticks later, and the
 * server records what each input step admitted. The replay installs that record and has a
 * transport that fails the test if anything reaches it, and every tick's weather and digest match.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Logger } from '@jsprismarine/logger';
import type { ScriptHttpRequest } from '@jsprismarine/script-host/host/world';
import { locateLibrary } from '@jsprismarine/script-host/library';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { Config } from '../config/Config';
import Server from '../Server';
import { stubRakNetListener } from '../testing/rakNetListener.test.helper';
import type { ScriptHttpAdmissionRecord, ScriptHttpOutcome, ScriptHttpTransport } from './ScriptHttpInputs';

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
const MODULE_UUID = 'c6f3e7a4-5b8d-4eaf-9a2c-3d4e5f6a7b82';

const SCRIPT = `
import { system, world, WeatherType } from '@minecraft/server';
import { http } from '@minecraft/server-net';

let sent = 0;
system.runInterval(() => {
    sent += 1;
    http.get('http://127.0.0.1:1/' + sent).then(
        (response) => world.getDimension('overworld').setWeather(response.status === 200 ? WeatherType.Rain : WeatherType.Thunder, 1000),
        () => world.getDimension('overworld').setWeather(WeatherType.Clear, 1000)
    );
}, 2);
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
}

/**
 * Runs a scripted server for {@link TICKS} ticks.
 * @param transport - What the server sends the scripts' requests with.
 * @param between - Runs between two ticks, as time passes on the network.
 * @param replay - The record to replay, or undefined to capture one into `recorded`.
 */
const runSession = async (
    transport: ScriptHttpTransport,
    between: (tick: number) => void,
    replay: readonly ScriptHttpAdmissionRecord[] | undefined,
    recorded: ScriptHttpAdmissionRecord[]
): Promise<SessionTicks> => {
    const root = mkdtempSync(path.join(tmpdir(), 'jsprismarine-scripted-http-replay-'));
    roots.push(root);
    const pack = path.join(root, 'pack');
    mkdirSync(path.join(pack, 'scripts'), { recursive: true });
    writeFileSync(
        path.join(pack, 'manifest.json'),
        JSON.stringify({
            format_version: 2,
            header: { name: 'networked', uuid: 'b7a4f8c5-6d9e-4fb0-8c3d-4e5f6a7b8c93', version: [1, 0, 0] },
            modules: [{ type: 'script', uuid: MODULE_UUID, version: [1, 0, 0], entry: 'scripts/main.js' }],
            dependencies: [
                { module_name: '@minecraft/server', version: '2.0.0' },
                { module_name: '@minecraft/server-net', version: '1.0.0-beta' }
            ]
        })
    );
    writeFileSync(path.join(pack, 'scripts', 'main.js'), SCRIPT);
    mkdirSync(path.join(root, 'config', MODULE_UUID), { recursive: true });
    writeFileSync(
        path.join(root, 'config', MODULE_UUID, 'permissions.json'),
        JSON.stringify({ allowed_modules: ['@minecraft/server', '@minecraft/server-net'] })
    );
    vi.stubEnv('JSP_DIR', root);
    writeFileSync(
        path.join(root, 'config.json'),
        JSON.stringify({
            'online-mode': false,
            'java-enabled': false,
            'preload-radius': 0,
            'view-distance': 1,
            'enable-ticking': false,
            'chunk-workers': 0,
            'enable-query': false,
            'content-world-packs': [pack],
            worlds: {
                world: { preset: 'minecraft:flat', provider: 'LevelDB', seed: '1', experiments: ['gametest'] }
            }
        })
    );

    const server = new Server({
        logger: new Logger('error'),
        config: new Config(),
        headless: true,
        wallClock: () => 1_800_000_000_000,
        replay: replay !== undefined,
        scriptHttpTransport: transport
    });
    // The server's own draws come from a seeded source, as the replay contract asks of a session.
    server.setRandom(seededRandom(1));
    if (replay === undefined) server.getScriptHttp().setRecorder({ record: (record) => recorded.push(record) });
    else server.getScriptHttp().replay(replay);
    await server.bootstrap('127.0.0.1', 0);
    try {
        expect(server.getScripts()).toBeDefined();
        const world = server.getWorldManager().getEntryWorld();
        const digests: string[] = [];
        const weather: string[] = [];
        for (let tick = 0; tick < TICKS; tick++) {
            server.advanceTick();
            digests.push(world.replayStateDigest());
            weather.push(world.getWeather());
            between(tick);
            // The answers released between ticks land before the next input step.
            await new Promise((turned) => setImmediate(turned));
        }
        return { digests, weather };
    } finally {
        await server.shutdown({ stayAlive: true });
    }
};

describe.skipIf(!scriptHostAvailable())('a session that sends HTTP requests', { tags: ['real-data'] }, () => {
    let captured: Awaited<ReturnType<typeof runSession>>;
    let replay: Awaited<ReturnType<typeof runSession>>;
    const recorded: ScriptHttpAdmissionRecord[] = [];
    let reached = 0;

    // Each run boots a server, whose content build is the slow part, so both run once, up front.
    beforeAll(async () => {
        // The captured network answers the oldest request on two ticks of every three, a 500
        // for every third request and a failure for every fifth.
        const waiting: { readonly request: ScriptHttpRequest; readonly answer: (o: ScriptHttpOutcome) => void }[] = [];
        let answered = 0;
        const network: ScriptHttpTransport = (request) =>
            new Promise((answer) => {
                waiting.push({ request, answer });
            });
        captured = await runSession(
            network,
            (tick) => {
                if (tick % 3 === 2) return;
                const next = waiting.shift();
                if (next === undefined) return;
                answered += 1;
                next.answer(
                    answered % 5 === 0
                        ? { errorCode: 111 }
                        : { status: answered % 3 === 0 ? 500 : 200, headers: [], body: next.request.uri }
                );
            },
            undefined,
            recorded
        );

        const offline: ScriptHttpTransport = () => {
            reached += 1;
            return Promise.resolve({ errorCode: 0 });
        };
        replay = await runSession(offline, () => {}, recorded, []);
    }, 180_000);

    it('replays to the same digest at every tick from the recorded results, without the network', () => {
        // The results changed the weather, so the digests compare their work.
        expect(new Set(captured.weather).size).toBeGreaterThan(2);
        expect(recorded.length).toBeGreaterThan(5);
        expect(reached).toBe(0);
        expect(replay.weather).toEqual(captured.weather);
        expect(replay.digests).toEqual(captured.digests);
    });
});
