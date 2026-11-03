/**
 * Boots a disposable JSPrismarine server for an e2e run: scratch data directory, flat world,
 * `online-mode` off so the unauthenticated test client can join, plain line console on stdio.
 */
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { repoRoot } from './cinnabar.mts';

/** A running scratch server: its address, console, log stream, and shutdown. */
export interface JspServer {
    port: number;
    /** The scratch `JSP_DIR` holding config, worlds, and log files. */
    dir: string;
    /** Every console line the server has printed so far. */
    lines: string[];
    /** Sends one console command, such as `say hello` or `time set noon`. */
    command: (line: string) => void;
    /** Resolves with the first new line matching `pattern`, or rejects after `timeoutMs`. */
    waitForLine: (pattern: RegExp, timeoutMs?: number) => Promise<string>;
    /** Asks the server to stop and waits for the process to exit. */
    stop: () => Promise<void>;
}

/** Ports reserved by servers this process is starting or running. */
const reservedUdpPorts = new Set<number>();

/** Reserves a UDP port the OS considers free right now. */
const reserveFreeUdpPort = async (): Promise<number> => {
    for (;;) {
        const port = await new Promise<number>((resolve, reject) => {
            const socket = dgram.createSocket('udp4');
            socket.once('error', reject);
            socket.bind(0, '127.0.0.1', () => {
                const { port } = socket.address();
                socket.close(() => resolve(port));
            });
        });
        if (reservedUdpPorts.has(port)) continue;
        reservedUdpPorts.add(port);
        return port;
    }
};

/**
 * Starts a scratch server from source or the built workspace output, then waits until it listens.
 *
 * @param options.port - Requested UDP port; defaults to an available local port.
 * @param options.dir - Scratch server directory; defaults to a temporary directory.
 * @param options.seconds - Startup budget before the boot is declared failed. Default 120.
 * @param options.naturalCowSpawning - Adds the cow spawn fixture for natural-spawn scenarios.
 * @param options.compressionAlgorithm - Batch algorithm advertised to the client. Defaults to ZLib.
 * @param options.raknetWorker - Runs RakNet socket and reliability work in a worker thread.
 * @param options.profile - Enables Node DevTools and preserves the shutdown trace for inspection.
 * @throws When the process exits or the readiness line does not appear in time.
 */
export const startServer = async (
    options: {
        port?: number;
        dir?: string;
        seconds?: number;
        naturalCowSpawning?: boolean;
        compressionAlgorithm?: 'zlib' | 'snappy' | 'none';
        raknetWorker?: boolean;
        profile?: boolean;
    } = {}
): Promise<JspServer> => {
    const port = options.port ?? (await reserveFreeUdpPort());
    if (options.port !== undefined) {
        if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
            throw new Error(`invalid UDP port: ${port}`);
        }
        if (reservedUdpPorts.has(port)) throw new Error(`UDP port ${port} is already reserved by this e2e run`);
        reservedUdpPorts.add(port);
    }
    const dir = options.dir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-e2e-server-'));
    fs.mkdirSync(dir, { recursive: true });

    const datapack = path.join(dir, 'client-e2e-datapack');
    const customDimension = path.join(datapack, 'data', 'client_e2e', 'dimension_type', 'custom.json');
    fs.mkdirSync(path.dirname(customDimension), { recursive: true });
    fs.writeFileSync(
        path.join(datapack, 'pack.mcmeta'),
        JSON.stringify({ pack: { pack_format: 121, description: 'Client e2e dimensions' } }, null, 4)
    );
    fs.writeFileSync(
        customDimension,
        `${JSON.stringify(
            {
                min_y: 0,
                height: 256,
                logical_height: 256,
                coordinate_scale: 1,
                has_skylight: true,
                has_ceiling: false,
                ambient_light: 0,
                monster_spawn_light_level: 0,
                monster_spawn_block_light_limit: 0,
                infiniburn: '#minecraft:infiniburn_overworld'
            },
            null,
            4
        )}\n`
    );

    const behaviorPack = path.join(dir, 'client-e2e-behavior-pack');
    fs.mkdirSync(path.join(behaviorPack, 'entities'), { recursive: true });
    fs.writeFileSync(
        path.join(behaviorPack, 'manifest.json'),
        JSON.stringify(
            {
                format_version: 2,
                header: {
                    name: 'Client e2e entities',
                    description: 'Entities used by client e2e scenarios',
                    uuid: 'c3de07fa-bc74-4c08-bdd1-330b9fdc5100',
                    version: [1, 0, 0],
                    min_engine_version: [1, 21, 0]
                },
                modules: [
                    {
                        type: 'data',
                        uuid: 'c3de07fa-bc74-4c08-bdd1-330b9fdc5101',
                        version: [1, 0, 0]
                    }
                ]
            },
            null,
            4
        )
    );
    fs.writeFileSync(
        path.join(behaviorPack, 'entities', 'ender_dragon.json'),
        `${JSON.stringify(
            {
                format_version: '1.21.0',
                'minecraft:entity': {
                    description: {
                        identifier: 'minecraft:ender_dragon',
                        is_spawnable: true,
                        is_summonable: true
                    },
                    components: {
                        'minecraft:health': { value: 200, max: 200 },
                        'minecraft:collision_box': { width: 13, height: 4 },
                        'minecraft:physics': { has_gravity: false, has_collision: false },
                        'minecraft:type_family': { family: ['dragon', 'mob'] },
                        'minecraft:on_death': { event: 'minecraft:start_death', target: 'self' }
                    },
                    component_groups: {
                        dragon_death: { 'minecraft:behavior.dragondeath': { priority: 0 } }
                    },
                    events: {
                        'minecraft:start_death': { add: { component_groups: ['dragon_death'] } }
                    }
                }
            },
            null,
            4
        )}\n`
    );
    fs.writeFileSync(
        path.join(behaviorPack, 'entities', 'pig.json'),
        `${JSON.stringify(
            {
                format_version: '1.21.0',
                'minecraft:entity': {
                    description: {
                        identifier: 'minecraft:pig',
                        is_spawnable: true,
                        is_summonable: true
                    },
                    components: {
                        'minecraft:health': { value: 10, max: 10 },
                        'minecraft:collision_box': { width: 0.9, height: 0.9 },
                        'minecraft:physics': { has_gravity: true, has_collision: true },
                        'minecraft:type_family': { family: ['pig', 'mob'] }
                    }
                }
            },
            null,
            4
        )}\n`
    );
    if (options.naturalCowSpawning) {
        fs.writeFileSync(
            path.join(behaviorPack, 'entities', 'cow.json'),
            `${JSON.stringify(
                {
                    format_version: '1.21.0',
                    'minecraft:entity': {
                        description: {
                            identifier: 'minecraft:cow',
                            is_spawnable: true,
                            is_summonable: true
                        },
                        components: {
                            'minecraft:health': { value: 10, max: 10 },
                            'minecraft:collision_box': { width: 0.9, height: 1.3 },
                            'minecraft:physics': { has_gravity: true, has_collision: true },
                            'minecraft:type_family': { family: ['cow', 'mob'] }
                        }
                    }
                },
                null,
                4
            )}\n`
        );
        const spawnRules = path.join(behaviorPack, 'spawn_rules');
        fs.mkdirSync(spawnRules, { recursive: true });
        fs.writeFileSync(
            path.join(spawnRules, 'cow.json'),
            `${JSON.stringify(
                {
                    format_version: '1.8.0',
                    'minecraft:spawn_rules': {
                        description: { identifier: 'minecraft:cow', population_control: 'animal' },
                        conditions: [
                            {
                                'minecraft:spawns_on_surface': {},
                                'minecraft:spawns_on_block_filter': ['minecraft:grass_block'],
                                'minecraft:weight': { default: 100 },
                                'minecraft:herd': { min_size: 1, max_size: 1 }
                            }
                        ]
                    }
                },
                null,
                4
            )}\n`
        );
    }

    const flatGenerator = (block: string) => ({
        type: 'minecraft:flat',
        settings: {
            layers: [
                { block: 'minecraft:bedrock', height: 1 },
                { block, height: 3 }
            ],
            biome: 'minecraft:plains',
            lakes: false,
            features: false,
            structure_overrides: []
        }
    });
    const config = {
        port: port,
        'online-mode': false,
        'packet-compression-algorithm': options.compressionAlgorithm ?? 'zlib',
        'use-raknet-worker': options.raknetWorker ?? false,
        'level-name': 'e2e',
        worlds: {
            e2e: {
                seed: '1',
                preset: 'minecraft:flat',
                dimensions: {
                    'minecraft:the_nether': {
                        type: 'minecraft:the_nether',
                        generator: flatGenerator('minecraft:netherrack')
                    },
                    'minecraft:the_end': {
                        type: 'minecraft:the_end',
                        generator: flatGenerator('minecraft:end_stone')
                    },
                    'client_e2e:custom': {
                        type: 'client_e2e:custom',
                        generator: { type: 'jsprismarine:void' }
                    }
                }
            }
        },
        'content-world-packs': [behaviorPack],
        'content-datapacks': [datapack],
        'preload-radius': 0,
        'max-players': 4,
        motd: 'JSPrismarine e2e'
    };
    fs.writeFileSync(path.join(dir, 'config.json'), `${JSON.stringify(config, null, 4)}\n`);

    const serverPackage = path.join(repoRoot, 'packages', 'server');
    const entryMode = process.env.JSP_E2E_SERVER_ENTRY ?? 'source';
    if (entryMode !== 'source' && entryMode !== 'dist') {
        throw new Error(`JSP_E2E_SERVER_ENTRY must be 'source' or 'dist', got '${entryMode}'`);
    }
    const built = entryMode === 'dist';
    const serverEntry = path.join(serverPackage, built ? 'dist' : 'src', built ? 'Server.es.js' : 'Server.ts');
    if (built && !fs.existsSync(serverEntry)) {
        throw new Error(`built server entry is missing at ${serverEntry}; run pnpm run server:build first`);
    }
    const coverageHook = path.join(path.dirname(fileURLToPath(import.meta.url)), 'coverage-exit.mjs');
    const coverageArgs = process.env.NODE_V8_COVERAGE ? ['--import', coverageHook] : [];
    const child: ChildProcess = spawn(
        process.execPath,
        [
            ...(built ? ['--conditions=jsprismarine:dist'] : ['--import', 'tsx']),
            ...coverageArgs,
            serverEntry,
            '--no-tui',
            '--port',
            String(port),
            ...(options.profile ? ['--devtools'] : [])
        ],
        {
            cwd: serverPackage,
            env: { ...process.env, JSP_DIR: dir, NODE_ENV: 'production' },
            stdio: ['pipe', 'pipe', 'pipe']
        }
    );

    const lines: string[] = [];
    const lineWaiters: { pattern: RegExp; resolve: (line: string) => void }[] = [];
    let buffered = '';
    const onOutput = (chunk: Buffer): void => {
        buffered += chunk.toString();
        for (;;) {
            const newline = buffered.indexOf('\n');
            if (newline === -1) break;
            // The line console colors its output; strip ANSI escapes so patterns match plainly.
            // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escapes start with ESC.
            const line = buffered.slice(0, newline).replace(/\u001b\[[0-9;]*m/g, '');
            buffered = buffered.slice(newline + 1);
            lines.push(line);
            for (let index = lineWaiters.length - 1; index >= 0; index -= 1) {
                const waiter = lineWaiters[index]!;
                if (waiter.pattern.test(line)) {
                    lineWaiters.splice(index, 1);
                    waiter.resolve(line);
                }
            }
        }
    };
    child.stdout?.on('data', onOutput);
    child.stderr?.on('data', onOutput);

    const exited = new Promise<void>((resolve) =>
        child.once('exit', () => {
            reservedUdpPorts.delete(port);
            resolve();
        })
    );

    const waitForLine = (pattern: RegExp, timeoutMs = 60_000): Promise<string> =>
        new Promise((resolve, reject) => {
            const waiter = { pattern, resolve };
            lineWaiters.push(waiter);
            setTimeout(() => {
                const index = lineWaiters.indexOf(waiter);
                if (index === -1) return;
                lineWaiters.splice(index, 1);
                reject(new Error(`server never printed ${pattern} (last: ${lines.at(-1) ?? '<nothing>'})`));
            }, timeoutMs).unref();
        });

    const seconds = options.seconds ?? 120;
    try {
        await Promise.race([
            waitForLine(/now listening on port/, seconds * 1000),
            exited.then(() => {
                throw new Error(`server exited during startup; output ends with: ${lines.slice(-10).join('\n')}`);
            })
        ]);
    } catch (error) {
        if (child.exitCode === null && child.signalCode === null) {
            const killer = setTimeout(() => child.kill('SIGKILL'), 15_000);
            child.kill('SIGTERM');
            await exited;
            clearTimeout(killer);
        }
        fs.rmSync(dir, { recursive: true, force: true });
        throw error;
    }

    if (options.profile) {
        const inspectorLine = lines.findLast((line) => line.startsWith('JSPrismarine inspector:'));
        if (inspectorLine !== undefined) console.log(`e2e ${inspectorLine}`);
    }

    return {
        port,
        dir,
        lines,
        command: (line) => child.stdin?.write(`${line}\n`),
        waitForLine,
        stop: async () => {
            if (child.exitCode === null && child.signalCode === null) {
                child.stdin?.write('stop\n');
                const killer = setTimeout(() => child.kill('SIGKILL'), 15_000);
                await exited;
                clearTimeout(killer);
            }
            if (!options.profile) fs.rmSync(dir, { recursive: true, force: true });
        }
    };
};
