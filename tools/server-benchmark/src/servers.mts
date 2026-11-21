/**
 * How each server is fetched, configured and started.
 *
 * Every server runs from a fresh data directory with its shipped defaults, apart from the settings
 * each definition lists with a reason. Those settings are what the workload needs on all three: a
 * login without Xbox Live, a fixed seed, the same view and simulation distance, creative mode so a
 * teleported bot does not die, a flat world in the flat scenario, and no telemetry or update
 * checks from a benchmark run.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    chmodSync,
    copyFileSync,
    cpSync,
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    renameSync,
    symlinkSync,
    writeFileSync
} from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTTagCompound, Types } from '@jsprismarine/nbt';

import { isRecord } from './isRecord.mts';
import { commitSource } from './results.mts';
import { ServerProcess } from './serverProcess.mts';

import type { ScenarioId, ServerId, SettingChange, Transport } from './results.mts';
import type { LaunchSpec } from './serverProcess.mts';

/** The repository root. */
export const REPO = path.resolve(import.meta.dirname, '..', '..', '..');
/** The shared download cache, where the pinned servers live. */
export const CACHE = path.join(REPO, 'node_modules', '.cache', 'jsprismarine');

/** What every server is asked to do in a scenario. */
export interface WorldRequest {
    readonly scenario: ScenarioId;
    readonly seed: number;
    readonly viewDistance: number;
    readonly simulationDistance: number;
    readonly maxPlayers: number;
    /** The port players join on; 19132 is every server's default. */
    readonly port: number;
    /** A directory every run of one benchmark shares, for copies a server needs only once. */
    readonly stageDir: string;
}

/** The port all three servers listen on unless told otherwise. */
export const DEFAULT_PORT = 19132;

/** A data directory ready to start: how to launch the server, and the settings changed from its defaults. */
export interface PreparedServer {
    readonly launch: LaunchSpec;
    readonly settings: readonly SettingChange[];
}

/**
 * One server the benchmark can run. The harness hands {@link ServerDefinition.prepare} an empty
 * directory and a {@link WorldRequest}, and starts what it returns.
 */
export interface ServerDefinition {
    readonly id: ServerId;
    readonly name: string;
    /** The transport the bots join over. */
    readonly transport: Transport;
    /** Why this server cannot run on this host, or null when it can. */
    unavailable(): string | null;
    /** Fetches whatever the server needs and records which build it is. */
    describe(): Promise<{ version: string; source: string }>;
    /** What the server generates in a scenario, in its own terms. */
    world(scenario: ScenarioId): string;
    /** Writes a fresh data directory into `dir` and returns how to start the server in it. */
    prepare(dir: string, request: WorldRequest): Promise<PreparedServer>;
}

/** A setting change, kept only when the value differs from the default. */
const change = (key: string, value: unknown, defaultValue: unknown, reason: string): SettingChange[] =>
    String(value) === String(defaultValue)
        ? []
        : [{ key, value: String(value), default: String(defaultValue), reason }];

const REASONS = {
    offline: 'The bots sign their own logins, as a client that is not signed in to Xbox Live does.',
    seed: 'The same seed on every server and in every round.',
    viewDistance: 'The same view distance on every server; the bots ask for it too.',
    simulationDistance:
        "The same simulation distance on every server: JSPrismarine's is fixed at 10 and Pumpkin's default is 10.",
    creative: 'A bot teleported above the ground falls, and in survival mode it could die between steps.',
    flat: 'The flat scenario measures ticking and chunk delivery without terrain generation.',
    telemetry: "A benchmark run should not count in the server project's usage statistics.",
    startupLookup: 'A network call at startup that the benchmark does not need; the bots connect over loopback.',
    port: 'Another process on the benchmark host held the default port.'
} as const;

// --- JSPrismarine ---------------------------------------------------------------------------------

const JSP_ENTRY = path.join(REPO, 'packages', 'server', 'dist', 'Server.js');

const JSP_READY = /JSPrismarine is now listening on port/;

/**
 * The packaged executable to benchmark in place of `node packages/server/dist/Server.js`, such as
 * the Bun AOT build `.github/scripts/build-aot.mjs` writes. Users run the executable, so CI
 * measures it; without one the harness runs the built entry, which is quicker to iterate on.
 */
let jspExecutable: string | undefined;

/** Benchmarks this executable for both JSPrismarine variants. */
export const useJspExecutable = (file: string): void => {
    jspExecutable = path.resolve(file);
};

/** The Bedrock vanilla behavior packs the checkout fetched, which an executable would download. */
const fetchedBehaviorPacks = (): string => path.join(bdsDir(), 'behavior_packs');

/**
 * The directory an executable runs from, once per benchmark. Its first start unpacks the data it
 * carries under `node_modules` there and writes its native libraries to the cache beside them, so
 * that start runs here, on a flat world of its own, before any measured run. Every measured start
 * then finds the directory warm, as a server that has run before does.
 */
const executableHome = async (executable: string, request: WorldRequest): Promise<string> => {
    const home = path.join(request.stageDir, 'jsprismarine-home');
    const warmed = path.join(home, 'warmed');
    if (existsSync(warmed)) return home;
    const data = path.join(home, 'warmup-data');
    mkdirSync(data, { recursive: true });
    writeFileSync(
        path.join(data, 'config.json'),
        `${JSON.stringify({ 'server-port': request.port, 'server-portv6': request.port, 'online-mode': false, 'enable-server-public-ip-lookup': false, stats: { bstats: { enabled: false } }, worlds: { world: { preset: 'minecraft:flat' } } }, null, 4)}\n`
    );
    const server = new ServerProcess(
        {
            command: executable,
            args: ['--no-tui'],
            cwd: home,
            env: { JSP_DIR: data, JSP_VANILLA_BEHAVIOR_PACK: fetchedBehaviorPacks() },
            ready: JSP_READY
        },
        path.join(home, 'warmup.log')
    );
    try {
        await server.waitReady(600_000);
    } finally {
        await server.stop(60_000);
    }
    writeFileSync(warmed, '');
    return home;
};

/**
 * JSPrismarine listens on RakNet and NetherNet at once by default, so both variants run the same
 * server with the same settings; only the bots' transport differs.
 */
const jsprismarine = (transport: Transport): ServerDefinition => ({
    id: `jsprismarine-${transport}`,
    name: `JSPrismarine over ${transport === 'raknet' ? 'RakNet' : 'NetherNet'}`,
    transport,
    unavailable: () => {
        if (jspExecutable !== undefined) return existsSync(jspExecutable) ? null : `${jspExecutable} is missing`;
        return existsSync(JSP_ENTRY) ? null : `${path.relative(REPO, JSP_ENTRY)} is missing; run pnpm run build first`;
    },
    describe: async () => {
        const manifest: unknown = JSON.parse(
            readFileSync(path.join(REPO, 'packages', 'server', 'package.json'), 'utf8')
        );
        const version = isRecord(manifest) && typeof manifest.version === 'string' ? manifest.version : 'unknown';
        const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim();
        const dirty = execFileSync('git', ['status', '--porcelain', '--', 'packages'], { cwd: REPO, encoding: 'utf8' });
        return { version, source: commitSource(sha, dirty.trim() !== '') };
    },
    world: (scenario) =>
        scenario === 'flat' ? 'minecraft:flat preset' : 'minecraft:normal preset, Java Edition terrain',
    prepare: async (dir, request) => {
        const preset = request.scenario === 'flat' ? 'minecraft:flat' : 'minecraft:normal';
        const config = {
            ...(request.port === DEFAULT_PORT ? {} : { 'server-port': request.port, 'server-portv6': request.port }),
            'online-mode': false,
            'enable-server-public-ip-lookup': false,
            // The benchmark drives Bedrock clients, and Bedrock Dedicated Server has no Java listener.
            'java-enabled': false,
            stats: { bstats: { enabled: false } },
            gamemode: 'creative',
            'view-distance': request.viewDistance,
            'max-players': Math.max(20, request.maxPlayers),
            worlds: { world: { preset, seed: request.seed } }
        };
        writeFileSync(path.join(dir, 'config.json'), `${JSON.stringify(config, null, 4)}\n`);
        const launch: LaunchSpec =
            jspExecutable === undefined
                ? {
                      command: process.execPath,
                      args: ['--conditions=jsprismarine:dist', '--unhandled-rejections=strict', JSP_ENTRY, '--no-tui'],
                      cwd: path.dirname(path.dirname(JSP_ENTRY)),
                      env: { JSP_DIR: dir, NODE_ENV: 'production' },
                      ready: JSP_READY
                  }
                : {
                      command: jspExecutable,
                      args: ['--no-tui'],
                      cwd: await executableHome(jspExecutable, request),
                      env: { JSP_DIR: dir, JSP_VANILLA_BEHAVIOR_PACK: fetchedBehaviorPacks() },
                      ready: JSP_READY
                  };
        return {
            launch,
            settings: [
                ...change('server-port', request.port, DEFAULT_PORT, REASONS.port),
                ...change('online-mode', false, true, REASONS.offline),
                ...change('worlds.world.seed', request.seed, 'random', REASONS.seed),
                ...change('worlds.world.preset', preset, 'minecraft:normal', REASONS.flat),
                ...change('view-distance', request.viewDistance, 10, REASONS.viewDistance),
                ...change('max-players', config['max-players'], 20, 'Room for every bot.'),
                ...change('gamemode', 'creative', 'survival', REASONS.creative),
                ...change('enable-server-public-ip-lookup', false, true, REASONS.startupLookup),
                ...change('stats.bstats.enabled', false, true, REASONS.telemetry)
            ]
        };
    }
});

// --- Bedrock Dedicated Server ---------------------------------------------------------------------

interface BdsPin {
    readonly protocol: number;
    readonly serverVersion: string;
    readonly minecraftVersion: string;
}

/** The Bedrock Dedicated Server `packages/bedrock-data/sources.json` names as the default. */
export const bdsPin = (): BdsPin => {
    const sources: unknown = JSON.parse(
        readFileSync(path.join(REPO, 'packages', 'bedrock-data', 'sources.json'), 'utf8')
    );
    const bds = isRecord(sources) ? sources.bds : undefined;
    const protocol = isRecord(bds) ? bds.defaultProtocolVersion : undefined;
    const version = isRecord(bds) && isRecord(bds.versions) ? bds.versions[String(protocol)] : undefined;
    if (typeof protocol !== 'number' || !isRecord(version)) {
        throw new Error('packages/bedrock-data/sources.json has no bds.defaultProtocolVersion entry');
    }
    return {
        protocol,
        serverVersion: String(version.serverVersion),
        minecraftVersion: String(version.minecraftVersion)
    };
};

const bdsDir = () => path.join(CACHE, 'bds', `v${bdsPin().protocol}`, 'unpacked');

/**
 * An executable copy of the pinned binary, made once per benchmark. The fetched archive stays
 * untouched: its files were extracted without an execute bit, and it is downloaded data.
 */
const stageBdsBinary = (stageDir: string): string => {
    const binary = path.join(stageDir, `bedrock_server-${bdsPin().serverVersion}`);
    if (!existsSync(binary)) {
        mkdirSync(stageDir, { recursive: true });
        copyFileSync(path.join(bdsDir(), 'bedrock_server'), `${binary}.partial`);
        renameSync(`${binary}.partial`, binary);
    }
    chmodSync(binary, 0o755);
    return binary;
};

/** Sets `key=value` in a `server.properties` text, appending the key when it is missing. */
export const setProperty = (text: string, key: string, value: string): string => {
    const line = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=.*$`, 'm');
    return line.test(text) ? text.replace(line, `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`;
};

/** The value a shipped `server.properties` gives a key, or the empty string. */
const shippedProperty = (text: string, key: string): string =>
    new RegExp(`^${key}=(.*)$`, 'm').exec(text)?.[1]?.trim() ?? '';

const bds: ServerDefinition = {
    id: 'bds',
    name: 'Bedrock Dedicated Server',
    transport: 'raknet',
    unavailable: () => {
        if (process.platform !== 'linux' || process.arch !== 'x64') {
            return `Bedrock Dedicated Server ships for Linux x86-64 only, and this host is ${process.platform}-${process.arch}`;
        }
        return existsSync(path.join(bdsDir(), 'bedrock_server'))
            ? null
            : 'the pinned server is not fetched; run pnpm --filter @jsprismarine/bedrock-data run fetch:sources';
    },
    describe: async () => {
        const pin = bdsPin();
        return {
            version: pin.serverVersion,
            source: `bedrock-server-${pin.serverVersion}.zip, pinned in packages/bedrock-data/sources.json`
        };
    },
    world: (scenario) => (scenario === 'flat' ? 'level-type=FLAT' : 'level-type=DEFAULT, Bedrock Edition terrain'),
    prepare: async (dir, request) => {
        const source = bdsDir();
        // The server reads and writes every path against its working directory, so each run gets
        // its own copy of the archive. The 250 MB binary is linked to one copy all runs share.
        for (const entry of readdirSync(source)) {
            if (entry === 'worlds' || entry === 'bedrock_server' || entry.startsWith('.jsp-')) continue;
            cpSync(path.join(source, entry), path.join(dir, entry), { recursive: true });
        }
        symlinkSync(stageBdsBinary(request.stageDir), path.join(dir, 'bedrock_server'));
        const shipped = readFileSync(path.join(source, 'server.properties'), 'utf8');
        const levelType = request.scenario === 'flat' ? 'FLAT' : 'DEFAULT';
        const maxPlayers = Math.max(Number(shippedProperty(shipped, 'max-players')) || 10, request.maxPlayers);
        const values: Array<[string, string, string]> = [
            [
                'transport',
                'raknet',
                "The bots' NetherNet connections to this server fail within seconds " +
                    '(https://github.com/JSPrismarine/JSPrismarine/issues/3437). It is compared with JSPrismarine over RakNet.'
            ],
            ['server-port', String(request.port), REASONS.port],
            ['server-portv6', String(request.port + 1), REASONS.port],
            ['online-mode', 'false', REASONS.offline],
            ['allow-list', 'false', 'The allow list would refuse the bots.'],
            ['level-seed', String(request.seed), REASONS.seed],
            ['level-type', levelType, REASONS.flat],
            ['view-distance', String(request.viewDistance), REASONS.viewDistance],
            ['tick-distance', String(request.simulationDistance), REASONS.simulationDistance],
            ['max-players', String(maxPlayers), 'Room for every bot.'],
            ['gamemode', 'creative', REASONS.creative]
        ];
        let properties = shipped;
        for (const [key, value] of values) properties = setProperty(properties, key, value);
        writeFileSync(path.join(dir, 'server.properties'), properties);
        return {
            launch: {
                command: path.join(dir, 'bedrock_server'),
                args: [],
                cwd: dir,
                // The archive's own libraries sit beside the binary.
                env: { LD_LIBRARY_PATH: '.' },
                ready: /Server started\./
            },
            settings: values.flatMap(([key, value, reason]) =>
                // `level-type` is not in the shipped file; DEFAULT is what the server assumes.
                change(
                    key,
                    value,
                    shippedProperty(shipped, key) || (key === 'level-type' ? 'DEFAULT' : 'random'),
                    reason
                )
            )
        };
    }
};

// --- Pumpkin --------------------------------------------------------------------------------------

interface PumpkinAsset {
    readonly name: string;
    readonly sha256: string;
}

interface PumpkinPin {
    readonly tag: string;
    readonly commit: string;
    readonly assets: Readonly<Record<string, PumpkinAsset>>;
}

const readPumpkinPin = (): PumpkinPin => {
    const pin: unknown = JSON.parse(readFileSync(path.join(import.meta.dirname, '..', 'pumpkin.json'), 'utf8'));
    if (!isRecord(pin) || typeof pin.tag !== 'string' || typeof pin.commit !== 'string' || !isRecord(pin.assets)) {
        throw new Error('tools/server-benchmark/pumpkin.json needs a tag, a commit and assets');
    }
    const assets: Record<string, PumpkinAsset> = {};
    for (const [platform, asset] of Object.entries(pin.assets)) {
        if (isRecord(asset) && typeof asset.name === 'string' && typeof asset.sha256 === 'string') {
            assets[platform] = { name: asset.name, sha256: asset.sha256 };
        }
    }
    return { tag: pin.tag, commit: pin.commit, assets };
};

const pumpkinAsset = (): PumpkinAsset | undefined => readPumpkinPin().assets[`${process.platform}-${process.arch}`];

const pumpkinBinary = (): string => {
    const pin = readPumpkinPin();
    const asset = pumpkinAsset();
    if (asset === undefined)
        throw new Error(`Pumpkin publishes no pinned build for ${process.platform}-${process.arch}`);
    return path.join(CACHE, 'pumpkin', pin.tag, asset.name);
};

const sha256Of = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex');

/** Downloads the pinned release asset once, and checks it against the release's checksum every time. */
const ensurePumpkin = async (): Promise<string> => {
    const pin = readPumpkinPin();
    const asset = pumpkinAsset();
    const binary = pumpkinBinary();
    if (asset === undefined) throw new Error('no Pumpkin build for this platform');
    if (!existsSync(binary)) {
        mkdirSync(path.dirname(binary), { recursive: true });
        const url = `https://github.com/Pumpkin-MC/Pumpkin/releases/download/${encodeURIComponent(pin.tag)}/${asset.name}`;
        console.error(`benchmark: downloading ${url}`);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${url} answered ${response.status}`);
        const partial = `${binary}.partial`;
        writeFileSync(partial, Buffer.from(await response.arrayBuffer()));
        renameSync(partial, binary);
    }
    const actual = sha256Of(binary);
    if (actual !== asset.sha256) {
        throw new Error(
            `${binary} has sha256 ${actual}, but pumpkin.json pins ${asset.sha256}; delete it and run again`
        );
    }
    chmodSync(binary, 0o755);
    return binary;
};

/**
 * `world_gen_settings.dat` with a flat overworld. Pumpkin reads its generator from this file and
 * has no configuration key for it; a `minecraft:flat` generator without settings is its classic
 * flat preset.
 */
export const flatWorldGenSettings = (seed: number): Buffer => {
    const root = new NBTTagCompound('');
    const data = new NBTTagCompound('data');
    data.addValue('seed', new Types.LongVal(BigInt(seed)));
    data.addValue('generate_structures', new Types.ByteVal(0));
    data.addValue('bonus_chest', new Types.ByteVal(0));
    const dimensions = new NBTTagCompound('dimensions');
    const overworld = new NBTTagCompound('minecraft:overworld');
    overworld.addValue('type', new Types.StringVal('minecraft:overworld'));
    const generator = new NBTTagCompound('generator');
    generator.addValue('type', new Types.StringVal('minecraft:flat'));
    overworld.addChild(generator);
    dimensions.addChild(overworld);
    data.addChild(dimensions);
    root.addChild(data);
    const stream = new BinaryStream();
    root.writeToStream(stream, ByteOrder.BIG_ENDIAN);
    return gzipSync(stream.getBuffer());
};

/** `pumpkin.toml` with only the keys the benchmark sets; Pumpkin fills in every other default. */
const pumpkinToml = (request: WorldRequest, gamemode: string): string =>
    [
        `seed = "${request.seed}"`,
        `default_gamemode = "${gamemode}"`,
        '',
        '[networking.bedrock]',
        'online_mode = false',
        `view_distance = ${request.viewDistance}`,
        `simulation_distance = ${request.simulationDistance}`,
        `max_players = ${Math.max(1000, request.maxPlayers)}`,
        '',
        ...(request.port === DEFAULT_PORT
            ? []
            : ['[networking.bedrock.nethernet]', `address = "0.0.0.0:${request.port}"`, '']),
        '[update_checker]',
        'enabled = false',
        '',
        '[telemetry]',
        'enabled = false',
        ''
    ].join('\n');

const PUMPKIN_READY = /Server is now running/;

/**
 * Starts Pumpkin once in `dir` so it creates its world, then stops it. A new world overwrites any
 * `world_gen_settings.dat` already there, so the flat generator can only go in after this. The
 * first start writes no chunks, so the measured start still generates every chunk itself.
 */
const createPumpkinWorld = async (binary: string, dir: string): Promise<void> => {
    const server = new ServerProcess(
        { command: binary, args: [], cwd: dir, ready: PUMPKIN_READY },
        path.join(dir, 'create-world.log')
    );
    try {
        await server.waitReady(120_000);
    } finally {
        await server.stop(60_000);
    }
};

const pumpkin: ServerDefinition = {
    id: 'pumpkin',
    name: 'Pumpkin',
    // The release measured has no RakNet listener; NetherNet is how Bedrock clients reach it.
    transport: 'nethernet',
    unavailable: () =>
        pumpkinAsset() === undefined
            ? `Pumpkin publishes no pinned build for ${process.platform}-${process.arch}`
            : null,
    describe: async () => {
        const pin = readPumpkinPin();
        const binary = await ensurePumpkin();
        return {
            version: pin.tag,
            source: `${path.basename(binary)} from the ${pin.tag} GitHub release (commit ${pin.commit}), sha256 ${sha256Of(binary)}`
        };
    },
    world: (scenario) =>
        scenario === 'flat'
            ? 'minecraft:flat generator, classic flat'
            : 'minecraft:noise generator, Java Edition terrain',
    prepare: async (dir, request) => {
        const binary = await ensurePumpkin();
        const gamemode = 'Creative';
        writeFileSync(path.join(dir, 'pumpkin.toml'), pumpkinToml(request, gamemode));
        const flat = request.scenario === 'flat';
        if (flat) {
            await createPumpkinWorld(binary, dir);
            writeFileSync(
                path.join(dir, 'world', 'data', 'minecraft', 'world_gen_settings.dat'),
                flatWorldGenSettings(request.seed)
            );
        }
        return {
            launch: { command: binary, args: [], cwd: dir, ready: PUMPKIN_READY },
            settings: [
                ...change(
                    'networking.bedrock.nethernet.address',
                    `0.0.0.0:${request.port}`,
                    `0.0.0.0:${DEFAULT_PORT}`,
                    REASONS.port
                ),
                ...change('networking.bedrock.online_mode', false, true, REASONS.offline),
                ...change('seed', request.seed, 'random', REASONS.seed),
                ...(flat
                    ? change(
                          'world_gen_settings.dat overworld generator',
                          'minecraft:flat',
                          'minecraft:noise',
                          `${REASONS.flat} Pumpkin has no setting for it: the harness starts the server once to create the world, stops it, and writes the generator into the world before the measured start.`
                      )
                    : []),
                ...change('networking.bedrock.view_distance', request.viewDistance, 16, REASONS.viewDistance),
                ...change(
                    'networking.bedrock.simulation_distance',
                    request.simulationDistance,
                    10,
                    REASONS.simulationDistance
                ),
                ...change(
                    'networking.bedrock.max_players',
                    Math.max(1000, request.maxPlayers),
                    1000,
                    'Room for every bot.'
                ),
                ...change('default_gamemode', gamemode, 'Survival', REASONS.creative),
                ...change('update_checker.enabled', false, true, REASONS.startupLookup),
                ...change('telemetry.enabled', false, true, REASONS.telemetry)
            ]
        };
    }
};

/** Every server the benchmark knows, by id. */
export const SERVERS: Readonly<Record<ServerId, ServerDefinition>> = {
    'jsprismarine-nethernet': jsprismarine('nethernet'),
    'jsprismarine-raknet': jsprismarine('raknet'),
    pumpkin,
    bds
};
