/**
 * Boots a disposable JSPrismarine server for an e2e run: scratch data directory, flat world,
 * `online-mode` off so the unauthenticated test client can join, plain line console on stdio.
 */
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import dgram from 'node:dgram';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { OFFLINE_MESSAGE_DATA_ID } from '../../../packages/raknet/src/Constants.ts';
import { chunkWorkerCount } from '../../../packages/prismarine/src/world/generators/chunkConcurrency.ts';
import { repoRoot } from './cinnabar.mts';
import type { ClientTransport } from './cinnabar.mts';

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

/** Whether a TCP listener could bind the port right now. */
const tcpPortFree = (port: number): Promise<boolean> =>
    new Promise((resolve) => {
        const listener = net.createServer();
        listener.once('error', () => resolve(false));
        listener.listen(port, '127.0.0.1', () => listener.close(() => resolve(true)));
    });

/**
 * Reserves a port the OS considers free right now for UDP and for TCP: the server listens on
 * both, RakNet on UDP and NetherNet's signaling on TCP.
 */
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
        if (reservedUdpPorts.has(port) || !(await tcpPortFree(port))) continue;
        reservedUdpPorts.add(port);
        return port;
    }
};

/** Whether a UDP socket could bind the port on every interface right now. */
const udpPortFree = (port: number): Promise<boolean> =>
    new Promise((resolve) => {
        const socket = dgram.createSocket('udp4');
        socket.once('error', () => resolve(false));
        socket.bind(port, '0.0.0.0', () => socket.close(() => resolve(true)));
    });

/** Reserves `count` consecutive ports, free for UDP and TCP, and returns the first. */
const reserveConsecutivePorts = async (count: number): Promise<number> => {
    for (;;) {
        const start = await reserveFreeUdpPort();
        const rest = Array.from({ length: count - 1 }, (_, index) => start + 1 + index);
        let free = rest.every((port) => port <= 65_535 && !reservedUdpPorts.has(port));
        for (const port of rest) free = free && (await udpPortFree(port)) && (await tcpPortFree(port));
        if (free) {
            for (const port of rest) reservedUdpPorts.add(port);
            return start;
        }
        reservedUdpPorts.delete(start);
    }
};

/**
 * Where NetherNet's UDP goes, as `server-udp-ports` puts it:
 *
 * - `shared`: unset, so it is the server port, shared with RakNet.
 * - `single`: one other port every player shares.
 * - `range`: three other ports players are spread over.
 * - `range-with-server-port`: three ports, the first of them the server port.
 */
export type UdpPortsLayout = 'shared' | 'single' | 'range' | 'range-with-server-port';

/** Every {@link UdpPortsLayout}, as `--udp-ports` takes them. */
export const UDP_PORTS_LAYOUTS: readonly UdpPortsLayout[] = ['shared', 'single', 'range', 'range-with-server-port'];

/**
 * RakNet's unconnected ping and pong ids. `MessageIdentifiers` is an enum, which Node cannot
 * strip from TypeScript, so they are repeated here; `jsp-server.test.mts` holds them to it.
 */
export const RAKNET_UNCONNECTED_PING = 0x01;
export const RAKNET_UNCONNECTED_PONG = 0x1c;

/** How long a RakNet ping waits for a pong before the port counts as not speaking RakNet. */
const RAKNET_SILENCE_MS = 2_000;

/**
 * Whether anything answers a RakNet unconnected ping on the port. A server with RakNet on answers
 * within a tick of its socket; a NetherNet-only server sends nothing back.
 */
export const answersRakNetPing = (port: number): Promise<boolean> =>
    new Promise((resolve) => {
        const socket = dgram.createSocket('udp4');
        const finish = (answered: boolean): void => {
            clearTimeout(timer);
            socket.close();
            resolve(answered);
        };
        const timer = setTimeout(() => finish(false), RAKNET_SILENCE_MS);
        socket.on('message', (message) => {
            if (message[0] === RAKNET_UNCONNECTED_PONG) finish(true);
        });
        // Unconnected ping: id, the sender's time, the offline magic, the sender's guid.
        const ping = Buffer.alloc(1 + 8 + OFFLINE_MESSAGE_DATA_ID.byteLength + 8);
        ping[0] = RAKNET_UNCONNECTED_PING;
        OFFLINE_MESSAGE_DATA_ID.copy(ping, 9);
        socket.send(ping, port, '127.0.0.1');
    });

/**
 * Starts a scratch server from source or the built workspace output, then waits until it listens.
 *
 * @param options.port - Requested UDP port; defaults to an available local port.
 * @param options.dir - Scratch server directory; defaults to a temporary directory.
 * @param options.seconds - Startup budget before the boot is declared failed. Default 120.
 * @param options.naturalCowSpawning - Adds the cow spawn fixture for natural-spawn scenarios, and is
 *   the only option that leaves natural spawning on.
 * @param options.compressionAlgorithm - Batch algorithm advertised to the client. Defaults to Snappy.
 * @param options.raknetWorker - Runs RakNet socket and reliability work in a worker thread.
 * @param options.transport - How the client joins, and the one transport the server runs.
 *   `nethernet` turns RakNet off, and the boot fails if the port still answers a RakNet ping;
 *   `raknet`, the default, turns NetherNet off.
 * @param options.profile - Enables Node DevTools and preserves the shutdown trace for inspection.
 * @param options.preloadRadius - Chunks around spawn to generate and keep resident before listening.
 * @param options.worldgenSpawn - Boots the normal Overworld at seed 1234 for spawn testing.
 * @param options.udpPorts - Where NetherNet's UDP goes; see {@link UdpPortsLayout}.
 * @param options.publicIp - The `server-public-ip` the server advertises.
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
        transport?: ClientTransport;
        profile?: boolean;
        preloadRadius?: number;
        worldgenSpawn?: boolean;
        udpPorts?: UdpPortsLayout;
        publicIp?: string;
    } = {}
): Promise<JspServer> => {
    const layout = options.udpPorts ?? 'shared';
    // The range layouts pick the server port with the range, so the ports are consecutive.
    const rangeStart =
        options.port === undefined && layout === 'range-with-server-port'
            ? await reserveConsecutivePorts(3)
            : options.port === undefined && layout === 'range'
              ? await reserveConsecutivePorts(4)
              : undefined;
    const port = options.port ?? rangeStart ?? (await reserveFreeUdpPort());
    let udpPorts: string | undefined;
    if (layout === 'single') udpPorts = String(await reserveFreeUdpPort());
    if (layout === 'range') udpPorts = `${port + 1}-${port + 3}`;
    if (layout === 'range-with-server-port') udpPorts = `${port}-${port + 2}`;
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
    fs.writeFileSync(
        path.join(behaviorPack, 'entities', 'villager_v2.json'),
        `${JSON.stringify(
            {
                format_version: '1.21.0',
                'minecraft:entity': {
                    description: {
                        identifier: 'minecraft:villager_v2',
                        is_spawnable: true,
                        is_summonable: true
                    },
                    components: {
                        'minecraft:health': { value: 20, max: 20 },
                        'minecraft:collision_box': { width: 0.6, height: 1.9 },
                        'minecraft:physics': { has_gravity: true, has_collision: true },
                        'minecraft:type_family': { family: ['villager', 'mob'] },
                        'minecraft:economy_trade_table': {
                            table: 'trading/economy_trades/farmer_trades.json',
                            display_name: 'Farmer',
                            persist_trades: true
                        }
                    }
                }
            },
            null,
            4
        )}\n`
    );
    fs.mkdirSync(path.join(behaviorPack, 'trading', 'economy_trades'), { recursive: true });
    fs.writeFileSync(
        path.join(behaviorPack, 'trading', 'economy_trades', 'farmer_trades.json'),
        `${JSON.stringify(
            {
                tiers: [
                    {
                        total_exp_required: 0,
                        groups: [
                            {
                                num_to_select: -1,
                                trades: [
                                    {
                                        wants: [{ item: 'minecraft:emerald', quantity: 1 }],
                                        gives: [{ item: 'minecraft:bread', quantity: 4 }],
                                        trader_exp: 2,
                                        max_uses: 2,
                                        reward_exp: true
                                    }
                                ]
                            }
                        ]
                    }
                ]
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
        // server-udp-ports follows it, so each concurrent suite's server holds its own numbers.
        'server-port': port,
        // Concurrent suites each run a server, so the IPv6 listener cannot take the default
        // 19133 for all of them; an IPv6-only socket shares the IPv4 listener's number.
        'server-portv6': port,
        ...(udpPorts === undefined ? {} : { 'server-udp-ports': udpPorts }),
        ...(options.publicIp === undefined ? {} : { 'server-public-ip': options.publicIp }),
        'online-mode': false,
        // Debug, so the transactions and moves the server drops on purpose, and which loading
        // screens the client opened and closed, show in the evidence log.
        'log-level': 'debug',
        'packet-compression-algorithm': options.compressionAlgorithm ?? 'snappy',
        'use-raknet-worker': options.raknetWorker ?? true,
        // One transport per run, so a run tests the transport it names: cinnabar probes for
        // NetherNet first, so a RakNet run on a server with NetherNet on would join over NetherNet.
        ...(options.transport === 'nethernet' ? { 'enable-raknet': false } : { 'enable-nethernet': false }),
        // UDP 7551 is one fixed port per machine, and concurrent suites would contend for it. The
        // client joins by address, which needs none of it.
        'enable-lan-visibility': false,
        // The natural-spawn suite leaves spawning on for its cows, and the flat world's surface
        // sits below y 40, where a slime chunk spawns slimes in daylight. A slime killed the
        // survival player while the scenario sprinted ticks. Every monster's spawn rule has a
        // minimum difficulty above peaceful; the cow fixture has none.
        ...(options.naturalCowSpawning === true ? { difficulty: 'peaceful' } : {}),
        'level-name': 'e2e',
        worlds: {
            e2e: {
                seed: options.worldgenSpawn === true ? '1234' : '1',
                preset: options.worldgenSpawn === true ? 'minecraft:normal' : 'minecraft:flat',
                dimensions: {
                    'minecraft:the_nether': {
                        type: 'minecraft:the_nether',
                        generator: flatGenerator('minecraft:netherrack')
                    },
                    'minecraft:the_end': {
                        type: 'minecraft:the_end',
                        generator: flatGenerator('minecraft:end_stone')
                    },
                    // Flat rather than void, so an arrival has a floor that exists the moment its
                    // chunk loads: a command cannot fill a dimension nobody is in.
                    'client_e2e:custom': {
                        type: 'client_e2e:custom',
                        generator: flatGenerator('minecraft:stone')
                    }
                }
            }
        },
        'content-world-packs': [behaviorPack],
        'content-datapacks': [datapack],
        // `JSP_E2E_CHUNK_HOST=process` runs chunk generation in the generation host process.
        'chunk-host': process.env.JSP_E2E_CHUNK_HOST === 'process' ? 'process' : 'in-process',
        'preload-radius': options.preloadRadius ?? 0,
        // The default reserves two cores for gameplay and networking, which leaves a three-core
        // CI runner one worker for the noise Overworld, and the client then waits on its loading
        // screen while that worker generates the spawn area alone. One idle player needs no such
        // reserve.
        ...(options.worldgenSpawn === true ? { 'chunk-workers': Math.max(2, chunkWorkerCount()) } : {}),
        'max-players': 4,
        motd: 'JSPrismarine e2e',
        'packet-full-flush-fragments': process.env.JSP_E2E_FULL_FLUSH_FRAGMENTS === '1'
    };
    fs.writeFileSync(path.join(dir, 'config.json'), `${JSON.stringify(config, null, 4)}\n`);

    const serverPackage = path.join(repoRoot, 'packages', 'server');
    const entryMode = process.env.JSP_E2E_SERVER_ENTRY ?? 'source';
    if (entryMode !== 'source' && entryMode !== 'dist') {
        throw new Error(`JSP_E2E_SERVER_ENTRY must be 'source' or 'dist', got '${entryMode}'`);
    }
    const built = entryMode === 'dist';
    const serverEntry = path.join(serverPackage, built ? 'dist' : 'src', built ? 'Server.js' : 'Server.ts');
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

    const waitForLine = (pattern: RegExp, timeoutMs = 60_000): Promise<string> => {
        const line = new Promise<string>((resolve, reject) => {
            const waiter = { pattern, resolve };
            lineWaiters.push(waiter);
            setTimeout(() => {
                const index = lineWaiters.indexOf(waiter);
                if (index === -1) return;
                lineWaiters.splice(index, 1);
                reject(new Error(`server never printed ${pattern} (last: ${lines.at(-1) ?? '<nothing>'})`));
            }, timeoutMs).unref();
        });
        // Callers start a wait before the action that prints the line, then await something else
        // first. A wait that times out meanwhile was an unhandled rejection, which killed the run
        // before it wrote its artifacts; whoever awaits the wait still gets the error.
        line.catch(() => {});
        return line;
    };

    const seconds = options.seconds ?? 120;
    // Registered with the listening wait: signaling binds its TCP port after that line prints.
    const signaling =
        options.transport === 'nethernet'
            ? waitForLine(/NetherNet clients can join by address/, seconds * 1000)
            : Promise.resolve();
    try {
        await Promise.race([
            Promise.all([waitForLine(/now listening on port/, seconds * 1000), signaling]),
            exited.then(() => {
                throw new Error(`server exited during startup; output ends with: ${lines.slice(-10).join('\n')}`);
            })
        ]);
        // A NetherNet run proves nothing if the client could have fallen back to RakNet.
        if (options.transport === 'nethernet' && (await answersRakNetPing(port))) {
            throw new Error(`the NetherNet server answered a RakNet ping on UDP port ${port}; RakNet must be off`);
        }
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

    // Natural spawning picks where and what at random. The flat Nether and End are dark at
    // y 1 to 3 and the plains biome lets slimes and monsters spawn there, so a player waiting on a
    // dimension change or standing in the exit portal was attacked on some runs and not others.
    // Scenarios that need a mob summon it.
    if (options.naturalCowSpawning !== true) {
        const ruleSet = waitForLine(/spawn_mobs = false/, 30_000);
        child.stdin?.write('gamerule doMobSpawning false\n');
        await ruleSet;
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
