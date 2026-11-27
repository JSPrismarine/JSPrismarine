/**
 * Boots a disposable JSPrismarine server for an e2e run: scratch data directory, flat world,
 * `online-mode` off so the unauthenticated test client can join, plain line console on stdio.
 */
import type { ChildProcess } from 'node:child_process';
import { execFileSync, spawn } from 'node:child_process';
import dgram from 'node:dgram';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { javaServerCacheFolder, readGeneratedJavaVersion } from '../../../packages/bedrock-data/src/sources.ts';
import { OFFLINE_MESSAGE_DATA_ID } from '../../../packages/raknet/src/Constants.ts';
import { chunkWorkerCount } from '../../../packages/prismarine/src/world/generators/chunkConcurrency.ts';
import { DEFAULT_VIEW_DISTANCE_CHUNKS } from '../../../packages/prismarine/src/world/Proximity.ts';
import { repoRoot } from './cinnabar.mts';
import type { ClientTransport } from './cinnabar.mts';
import { newestCoverageFile } from './scenario-coverage.mts';

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
    /**
     * Has the server write a V8 coverage snapshot, and resolves with the new file's name. Resolves
     * with `undefined` when the run collects no coverage, or no file appeared in time.
     */
    snapshotCoverage: () => Promise<string | undefined>;
}

/**
 * What the client e2e script pack says to every player when the weather changes, followed by the
 * new weather's `WeatherType`, such as `Rain`.
 */
export const SCRIPT_WEATHER_MESSAGE = 'client-e2e script: the weather is now ';

/** The title of the form the client e2e script pack shows every player when a thunderstorm starts. */
export const SCRIPT_FORM_TITLE = 'client-e2e form';

/**
 * What the client e2e script pack says once a player answers its form, followed by the button the
 * player picked, from 0, or `canceled`.
 */
export const SCRIPT_FORM_MESSAGE = 'client-e2e script: the form answer is ';

/** The custom command the client e2e script pack registers in `startup`. */
export const SCRIPT_COMMAND = 'e2e:greet';

/**
 * What the client e2e script pack's custom command answers its sender, followed by the word the
 * sender passed and the type of the entity that ran it.
 */
export const SCRIPT_COMMAND_MESSAGE = 'client-e2e command: greeted ';

/** How far east, in blocks, the client e2e script pack teleports every player when it thunders. */
export const SCRIPT_TELEPORT_DISTANCE = 12;

/** The `/scriptevent` id that makes the client e2e script turn every player. */
export const SCRIPT_LOOK_EVENT = 'e2e:look';

/** Where the client e2e script turns a player to look: `x` the pitch, `y` the yaw, in degrees. */
export const SCRIPT_LOOK_ROTATION = { x: 30, y: 90 } as const;

/**
 * The `/scriptevent` id that makes the client e2e script send every player music, a property
 * override and a camera spline; with the message `end` it stops them again.
 */
export const SCRIPT_FEEDBACK_EVENT = 'e2e:feedback';

/** How long the client e2e script's camera spline runs, in seconds. */
export const SCRIPT_SPLINE_SECONDS = 30;

/**
 * What the client e2e script pack tells a player at each first spawn of a login, followed by how
 * many logins the dynamic property it keeps on the player has counted, this one included, and the
 * player's name.
 */
export const SCRIPT_VISITS_MESSAGE = 'client-e2e script: visit ';

/** The player dynamic property the client e2e script counts logins in. */
export const SCRIPT_VISITS_PROPERTY = 'e2e:visits';

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

/** The second level's `worlds` key, when a suite asks for one with `secondLevel`. */
export const SECOND_LEVEL = 'e2e_other';

/** The bread a farmer gives for one emerald in its only novice trade, which the fixture datapack sets. */
export const FARMER_BREAD = 4;

/**
 * The format part of the fixture datapack's `pack.mcmeta`, for the Java release the server loads
 * its content under, so the fixture loads without a format mismatch.
 *
 * The release's format comes from the `version.json` beside the vanilla datapack the server
 * loads: the one `JSP_VANILLA_DATAPACK` names, or the release's folder in the cache. A datapack
 * without one loads under the default release, so that release's record answers next. With
 * neither on disk the server has no generated Java data to say which format it reads, and the
 * fixture declares every format.
 */
const fixturePackFormat = (release: string = javaServerCacheFolder): Record<string, number> => {
    const cached = (name: string): string =>
        path.join(repoRoot, 'node_modules', '.cache', 'jsprismarine', 'vanilla-datapack', name);
    const override = process.env.JSP_VANILLA_DATAPACK;
    const datapack = override !== undefined && override !== '' ? override : cached(release);
    const record = readGeneratedJavaVersion(datapack) ?? readGeneratedJavaVersion(cached(javaServerCacheFolder));
    return record === undefined
        ? { min_format: 0, max_format: Number.MAX_SAFE_INTEGER }
        : { pack_format: record.dataPackFormat[0] };
};

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
 *   Defaults to the join's spawn radius on the noise world, and to 0 on the flat one.
 * @param options.worldgenSpawn - Boots Java's normal preset at seed 1234, its noise Overworld,
 *   Nether and End included, with the persistent terrain cache on.
 * @param options.secondLevel - Adds a second flat `worlds` entry, {@link SECOND_LEVEL}, whose
 *   Overworld shares the default level's dimension.
 * @param options.udpPorts - Where NetherNet's UDP goes; see {@link UdpPortsLayout}.
 * @param options.publicIp - The `server-public-ip` the server advertises.
 * @param options.protocolWindow - How many releases the server accepts, counted back from the
 *   newest. The server's default accepts the newest only, which refuses an older client.
 * @param options.javaVersion - The `content-java-version` the server runs: a Java release
 *   `sources.json` pins. Defaults to the default release.
 * @param options.addons - Addons from the repository's `addons/` folder, by name, that the server
 *   loads as world packs, as an installed addon is. The server loads a built copy in its folder.
 * @param options.addonConfigs - The config file of each addon, by name.
 * @param options.keepAliveInterval - The server's `keep-alive-interval`, in seconds; 0, which turns
 *   the pings off, unless given.
 * @param options.files - Files written into the server's folder before it starts, by path relative
 *   to it, such as an `.mcpack` under `addons/` that the server installs as it boots.
 * @param options.config - Config entries written over the harness's own, for a setting no other
 *   option covers.
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
        secondLevel?: boolean;
        udpPorts?: UdpPortsLayout;
        publicIp?: string;
        protocolWindow?: number;
        javaVersion?: string;
        addons?: readonly string[];
        /** The config file of each addon, by name, written beside its copy before the server starts. */
        addonConfigs?: Readonly<Record<string, unknown>>;
        /** Listens for Java Edition clients on this TCP port, as `java-enabled` and `java-port` do. */
        javaPort?: number;
        /** The server's `keep-alive-interval`, in seconds; 0, off, unless given. */
        keepAliveInterval?: number;
        /** Files written into the server's folder before it starts, by path relative to it. */
        files?: Readonly<Record<string, Uint8Array>>;
        /** Config entries written over the harness's own. */
        config?: Readonly<Record<string, unknown>>;
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

    // Each addon's package builds its scripts from the TypeScript sources, and the server loads a
    // copy in its own folder, so the config file an addon writes beside its folder stays out of
    // the repository.
    const addons = (options.addons ?? []).map((name) => {
        const source = path.join(repoRoot, 'addons', name);
        execFileSync('pnpm', ['--dir', source, 'run', 'build'], { stdio: 'inherit' });
        const copy = path.join(dir, 'e2e-addons', name);
        fs.cpSync(source, copy, {
            recursive: true,
            filter: (file) => !['node_modules', 'src'].includes(path.relative(source, file).split(path.sep)[0] ?? '')
        });
        const config = options.addonConfigs?.[name];
        if (config !== undefined)
            fs.writeFileSync(path.join(dir, 'e2e-addons', `${name}.config.json`), JSON.stringify(config, null, 4));
        return copy;
    });

    const datapack = path.join(dir, 'client-e2e-datapack');
    const customDimension = path.join(datapack, 'data', 'client_e2e', 'dimension_type', 'custom.json');
    fs.mkdirSync(path.dirname(customDimension), { recursive: true });
    fs.writeFileSync(
        path.join(datapack, 'pack.mcmeta'),
        JSON.stringify(
            { pack: { ...fixturePackFormat(options.javaVersion), description: 'Client e2e dimensions' } },
            null,
            4
        )
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

    // A novice farmer draws 2 of Java's 5 novice trades from the world's random state when a player
    // first uses it, so the trade screen showed different offers in different rows from run to run.
    // One trade for the whole tier gives the villager-trade scenario an offer it can count on.
    const farmerTrade = path.join(datapack, 'data', 'client_e2e', 'villager_trade', 'farmer_bread.json');
    const farmerTier = path.join(datapack, 'data', 'minecraft', 'trade_set', 'farmer', 'level_1.json');
    fs.mkdirSync(path.dirname(farmerTrade), { recursive: true });
    fs.mkdirSync(path.dirname(farmerTier), { recursive: true });
    fs.writeFileSync(
        farmerTrade,
        `${JSON.stringify(
            {
                gives: { count: FARMER_BREAD, id: 'minecraft:bread' },
                max_uses: 16,
                wants: { id: 'minecraft:emerald' }
            },
            null,
            4
        )}\n`
    );
    fs.writeFileSync(farmerTier, `${JSON.stringify({ amount: 1, trades: 'client_e2e:farmer_bread' }, null, 4)}\n`);

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

    // A behavior pack script, for the scenarios that check what a script does reaches the client.
    const scriptPack = path.join(dir, 'client-e2e-script-pack');
    fs.mkdirSync(path.join(scriptPack, 'scripts'), { recursive: true });
    fs.writeFileSync(
        path.join(scriptPack, 'manifest.json'),
        JSON.stringify(
            {
                format_version: 2,
                header: {
                    name: 'Client e2e scripts',
                    description: 'Scripts used by client e2e scenarios',
                    uuid: 'c3de07fa-bc74-4c08-bdd1-330b9fdc5200',
                    version: [1, 0, 0],
                    min_engine_version: [1, 21, 0]
                },
                modules: [
                    {
                        type: 'script',
                        language: 'javascript',
                        uuid: 'c3de07fa-bc74-4c08-bdd1-330b9fdc5201',
                        version: [1, 0, 0],
                        entry: 'scripts/main.js'
                    }
                ],
                dependencies: [
                    // 2.6.0 is the first version with camera splines.
                    { module_name: '@minecraft/server', version: '2.6.0' },
                    { module_name: '@minecraft/server-ui', version: '2.0.0' }
                ]
            },
            null,
            4
        )
    );
    fs.writeFileSync(
        path.join(scriptPack, 'scripts', 'main.js'),
        [
            "import { CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, LinearSpline, system, world } from '@minecraft/server';",
            "import { ActionFormData } from '@minecraft/server-ui';",
            '',
            'system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {',
            '    customCommandRegistry.registerCommand(',
            '        {',
            `            name: '${SCRIPT_COMMAND}',`,
            "            description: 'Greets whoever runs it',",
            '            permissionLevel: CommandPermissionLevel.Any,',
            "            mandatoryParameters: [{ name: 'word', type: CustomCommandParamType.String }]",
            '        },',
            '        (origin, word) => ({',
            '            status: CustomCommandStatus.Success,',
            `            message: \`${SCRIPT_COMMAND_MESSAGE}\${word} by \${origin.sourceEntity?.typeId}\``,
            '        })',
            '    );',
            '});',
            '',
            'system.afterEvents.scriptEventReceive.subscribe((event) => {',
            `    if (event.id !== '${SCRIPT_LOOK_EVENT}') return;`,
            '    for (const player of world.getAllPlayers()) {',
            `        player.setRotation({ x: ${SCRIPT_LOOK_ROTATION.x}, y: ${SCRIPT_LOOK_ROTATION.y} });`,
            '    }',
            '});',
            '',
            'let feedbackPig;',
            'system.afterEvents.scriptEventReceive.subscribe((event) => {',
            `    if (event.id !== '${SCRIPT_FEEDBACK_EVENT}') return;`,
            '    for (const player of world.getAllPlayers()) {',
            "        if (event.message === 'end') {",
            '            player.stopMusic();',
            '            player.camera.clear();',
            '            if (feedbackPig?.isValid) player.clearPropertyOverridesForEntity(feedbackPig);',
            '            continue;',
            '        }',
            "        player.playMusic('music.game', { fade: 1, loop: true, volume: 0.5 });",
            '        const { x, y, z } = player.location;',
            "        feedbackPig = player.dimension.spawnEntity('minecraft:pig', { x: x + 2, y, z });",
            "        player.setPropertyOverrideForEntity(feedbackPig, 'minecraft:climate_variant', 'cold');",
            "        player.camera.setCamera('minecraft:free', { location: { x, y: y + 2, z }, rotation: { x: 30, y: 0 } });",
            '        const spline = new LinearSpline();',
            // Three points and a key frame on each track: BDS plays a linear spline of two points
            // with no key frames, but cinnabar refuses one with fewer points or an empty track.
            '        spline.controlPoints = [{ x, y: y + 2, z }, { x, y: y + 5, z: z + 3 }, { x, y: y + 8, z: z + 6 }];',
            '        player.camera.playAnimation(spline, {',
            `            totalTimeSeconds: ${SCRIPT_SPLINE_SECONDS},`,
            '            animation: {',
            `                progressKeyFrames: [{ alpha: 0, timeSeconds: 0 }, { alpha: 1, timeSeconds: ${SCRIPT_SPLINE_SECONDS} }],`,
            '                rotationKeyFrames: [{ rotation: { x: 30, y: 0, z: 0 }, timeSeconds: 0 }]',
            '            }',
            '        });',
            '    }',
            "    if (event.message === 'end') feedbackPig?.remove();",
            '});',
            '',
            'world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {',
            '    if (!initialSpawn) return;',
            `    const visits = (player.getDynamicProperty('${SCRIPT_VISITS_PROPERTY}') ?? 0) + 1;`,
            `    player.setDynamicProperty('${SCRIPT_VISITS_PROPERTY}', visits);`,
            // The player's own members, which work at the first spawn as on BDS (#3422).
            `    player.sendMessage(\`${SCRIPT_VISITS_MESSAGE}\${visits} \${player.name}\`);`,
            '});',
            '',
            'world.afterEvents.weatherChange.subscribe((event) => {',
            `    world.sendMessage(\`${SCRIPT_WEATHER_MESSAGE}\${event.newWeather}\`);`,
            "    if (event.newWeather !== 'Thunder') return;",
            '    for (const player of world.getAllPlayers()) {',
            '        const { x, y, z } = player.location;',
            `        player.teleport({ x: x + ${SCRIPT_TELEPORT_DISTANCE}, y, z });`,
            `        new ActionFormData().title('${SCRIPT_FORM_TITLE}').body('Pick one').button('First').button('Second')`,
            '            .show(player)',
            '            .then((response) =>',
            `                world.sendMessage(\`${SCRIPT_FORM_MESSAGE}\${response.canceled ? 'canceled' : response.selection}\`)`,
            '            );',
            '    }',
            '});',
            ''
        ].join('\n')
    );

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
        // The client joins from this machine, so a public address would only cost each run
        // requests to the lookup services.
        'enable-server-public-ip-lookup': false,
        'online-mode': false,
        // Off unless a scenario tests the keep-alive, so no other scenario spends a ping per
        // interval or is kicked by one a loaded host answers late.
        'keep-alive-interval': options.keepAliveInterval ?? 0,
        // Off unless asked, so concurrent Bedrock runs do not all reach for the Java port.
        ...(options.javaPort === undefined
            ? { 'java-enabled': false }
            : { 'java-enabled': true, 'java-port': options.javaPort }),
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
        ...(options.protocolWindow === undefined ? {} : { 'protocol-window': options.protocolWindow }),
        'level-name': 'e2e',
        worlds: {
            e2e: {
                seed: options.worldgenSpawn === true ? '1234' : '1',
                preset: options.worldgenSpawn === true ? 'minecraft:normal' : 'minecraft:flat',
                dimensions: {
                    // The noise world keeps the preset's own Nether and End, so their generation
                    // is tested too.
                    ...(options.worldgenSpawn === true
                        ? {}
                        : {
                              'minecraft:the_nether': {
                                  type: 'minecraft:the_nether',
                                  generator: flatGenerator('minecraft:netherrack')
                              },
                              'minecraft:the_end': {
                                  type: 'minecraft:the_end',
                                  generator: flatGenerator('minecraft:end_stone')
                              }
                          }),
                    // Flat rather than void, so an arrival has a floor that exists the moment its
                    // chunk loads: a command cannot fill a dimension nobody is in.
                    'client_e2e:custom': {
                        type: 'client_e2e:custom',
                        generator: flatGenerator('minecraft:stone')
                    }
                }
            },
            ...(options.secondLevel === true ? { [SECOND_LEVEL]: { seed: '2', preset: 'minecraft:flat' } } : {})
        },
        'content-world-packs': [behaviorPack, scriptPack, ...addons],
        'content-datapacks': [datapack],
        ...(options.javaVersion === undefined ? {} : { 'content-java-version': options.javaVersion }),
        // `JSP_E2E_CHUNK_HOST=process` runs chunk generation in the generation host process.
        'chunk-host': process.env.JSP_E2E_CHUNK_HOST === 'process' ? 'process' : 'in-process',
        // A joining player gets `PlayStatus(PlayerSpawn)` once every chunk within
        // DEFAULT_VIEW_DISTANCE_CHUNKS of it is on the wire, and the client gives up on StartGame
        // after 30 s. Generating that much noise terrain beside another suite and the client's
        // first shader warmup took longer, so the noise world generates it before it listens.
        'preload-radius': options.preloadRadius ?? (options.worldgenSpawn === true ? DEFAULT_VIEW_DISTANCE_CHUNKS : 0),
        // The default reserves two cores for gameplay and networking, which leaves a three-core
        // CI runner one worker for the noise Overworld, and the client then waits on its loading
        // screen while that worker generates the spawn area alone. One idle player needs no such
        // reserve.
        ...(options.worldgenSpawn === true ? { 'chunk-workers': Math.max(2, chunkWorkerCount()) } : {}),
        'max-players': 4,
        motd: 'JSPrismarine e2e',
        'packet-full-flush-fragments': process.env.JSP_E2E_FULL_FLUSH_FRAGMENTS === '1',
        ...options.config
    };
    fs.writeFileSync(path.join(dir, 'config.json'), `${JSON.stringify(config, null, 4)}\n`);
    for (const [relative, data] of Object.entries(options.files ?? {})) {
        const file = path.resolve(dir, relative);
        if (path.relative(dir, file).startsWith('..')) throw new Error(`server file ${relative} is outside ${dir}`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, data);
    }

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
            // JSP_BSTATS=0: a test server never reports usage statistics.
            env: { ...process.env, JSP_DIR: dir, NODE_ENV: 'production', JSP_BSTATS: '0' },
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
        snapshotCoverage: async () => {
            const directory = process.env.NODE_V8_COVERAGE;
            const { pid } = child;
            if (!directory || pid === undefined || child.exitCode !== null) return undefined;
            const prefix = `coverage-${pid}-`;
            const ours = (): string[] => fs.readdirSync(directory).filter((name) => name.startsWith(prefix));
            const before = new Set(ours());
            child.kill('SIGUSR2');
            const deadline = Date.now() + 10_000;
            while (Date.now() < deadline) {
                // The newest of what appeared, since the interval's own snapshot can land beside it.
                const newest = newestCoverageFile(ours().filter((name) => !before.has(name)));
                if (newest !== undefined) return newest;
                await new Promise((resolve) => setTimeout(resolve, 25));
            }
            return undefined;
        },
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
